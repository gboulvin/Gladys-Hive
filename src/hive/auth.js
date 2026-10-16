// -----------------------------------------------------------------------------
// Hive account authentication.
//
// Hive (Centrica) accounts live in an AWS Cognito user pool. The login is an
// SRP handshake, usually followed by a 6-digit code sent by SMS. Once the code
// is accepted, Cognito hands out a "device": the integration confirms it and
// asks Cognito to remember it, so the next logins prove the device instead of
// asking for a new SMS code. In between, the refresh token renews the session
// tokens silently.
//
// What survives a restart lives in the session store (/data): the remembered
// device, the refresh token and a pending SMS challenge. Never the password,
// never the short-lived tokens, and none of it is ever logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createCognitoClient, CognitoError } from './cognito.js';
import {
  authenticationKey,
  claimSignature,
  cognitoTimestamp,
  createEphemeral,
  generateDeviceSecret,
} from './srp.js';

const logger = createLogger({ name: 'hive-auth' });

export const SSO_URL = 'https://sso.hivehome.com/';

// Read from the Hive SSO page at every start; these are the values it served
// when this integration was written, used if the page cannot be read.
export const FALLBACK_LOGIN_INFO = {
  poolId: 'eu-west-1_SamNfoWtf',
  clientId: '3rl4i0ajrmtdm8sbre54p9dvd9',
};

// Name of the remembered device in the Hive account (Cognito device list).
const DEVICE_NAME = 'Gladys Assistant';

// Renew the tokens this long before they expire.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

// Cognito keeps an SMS challenge open 3 minutes; past that the code is useless.
export const SMS_CHALLENGE_TTL_MS = 3 * 60 * 1000;

/** The account needs the code Hive just sent by SMS. */
export class SmsCodeRequiredError extends Error {
  constructor(destination) {
    super('An SMS code is required to finish the Hive login');
    this.name = 'SmsCodeRequiredError';
    this.destination = destination;
  }
}

/**
 * A login failure the user has to act on. `code` is one of:
 * `missing_credentials`, `invalid_credentials`, `invalid_sms_code`,
 * `sms_expired`, `password_reset_required`, `rate_limited`, `unavailable`,
 * `unsupported_challenge`.
 */
export class HiveAuthError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'HiveAuthError';
    this.code = code;
  }
}

/**
 * Read the Cognito pool and client ids from the Hive SSO page.
 * @param {typeof fetch} fetchImpl
 */
export async function fetchLoginInfo(fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(SSO_URL, { signal: AbortSignal.timeout(10_000) });
    const html = await response.text();
    const values = Object.fromEntries(
      [...html.matchAll(/window\.(\w+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]),
    );
    if (/^[\w-]+_\w+$/.test(values.HiveSSOPoolId ?? '') && values.HiveSSOPublicCognitoClientId) {
      return { poolId: values.HiveSSOPoolId, clientId: values.HiveSSOPublicCognitoClientId };
    }
    logger.warn('Hive SSO page without login settings, using the built-in ones');
  } catch (err) {
    logger.warn(`Hive SSO page unreachable (${err.message}), using the built-in login settings`);
  }
  return { ...FALLBACK_LOGIN_INFO };
}

function mapCognitoError(err) {
  if (!(err instanceof CognitoError)) {
    return err;
  }
  switch (err.type) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return new HiveAuthError('invalid_credentials', 'Incorrect Hive email or password');
    case 'PasswordResetRequiredException':
      return new HiveAuthError('password_reset_required', 'Hive asks for a password reset');
    case 'TooManyRequestsException':
    case 'LimitExceededException':
    case 'TooManyFailedAttemptsException':
      return new HiveAuthError('rate_limited', 'Too many Hive login attempts, try again later');
    case 'NetworkError':
    case 'InternalErrorException':
      return new HiveAuthError('unavailable', 'Hive login service unreachable');
    default:
      return new HiveAuthError('unavailable', err.message);
  }
}

export class HiveAuth {
  /**
   * @param {object} options
   * @param {string} options.username - Hive account email
   * @param {string} options.password
   * @param {{ load(): Promise<object>, save(state: object): Promise<void> }} options.store
   * @param {typeof fetch} [options.fetchImpl]
   * @param {{ poolId: string, clientId: string }} [options.loginInfo] - skips the SSO page
   * @param {() => number} [options.now]
   */
  constructor({ username, password, store, fetchImpl = globalThis.fetch, loginInfo, now }) {
    this.username = (username ?? '').trim();
    this.password = password ?? '';
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.loginInfo = loginInfo;
    this.now = now ?? (() => Date.now());
    this.tokens = null; // { idToken, accessToken, expiresAt }
    this.persisted = { username: this.username, device: null, refreshToken: null, pending: null };
    this.ready = null;
    this.inflight = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = (async () => {
        this.loginInfo ??= await fetchLoginInfo(this.fetchImpl);
        const [region, poolName] = this.loginInfo.poolId.split('_');
        this.poolName = poolName;
        this.cognito = createCognitoClient({
          region,
          clientId: this.loginInfo.clientId,
          fetchImpl: this.fetchImpl,
        });
        const saved = (await this.store.load()) ?? {};
        // Another account: its remembered device and tokens are not ours.
        if (saved.username && saved.username.toLowerCase() === this.username.toLowerCase()) {
          this.persisted = { ...this.persisted, ...saved, username: this.username };
        }
      })();
    }
    return this.ready;
  }

  /** The SMS challenge waiting for a code, if still open. */
  pendingSms() {
    const pending = this.persisted.pending;
    if (!pending || this.now() - pending.createdAt > SMS_CHALLENGE_TTL_MS) {
      return null;
    }
    return pending;
  }

  hasRememberedDevice() {
    return Boolean(this.persisted.device?.key);
  }

  /** Drop the session tokens (e.g. after a 401): the next call renews them. */
  invalidateTokens() {
    this.tokens = null;
  }

  /**
   * A valid IdToken (the Hive API credential), renewed or re-negotiated when
   * needed. Throws SmsCodeRequiredError when only an SMS code can unlock the
   * account, HiveAuthError when the user must fix something.
   */
  async getIdToken() {
    await this.init();
    if (this.tokens && this.tokens.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
      return this.tokens.idToken;
    }
    // One renewal at a time: the poller and a command may ask together.
    this.inflight ??= this.renew().finally(() => {
      this.inflight = null;
    });
    await this.inflight;
    return this.tokens.idToken;
  }

  async renew() {
    if (this.persisted.refreshToken) {
      try {
        await this.refresh();
        return;
      } catch (err) {
        logger.warn(`Hive session renewal failed (${err.type ?? err.message}), logging in again`);
        this.persisted.refreshToken = null;
        await this.save();
      }
    }
    await this.login();
  }

  async refresh() {
    const params = { REFRESH_TOKEN: this.persisted.refreshToken };
    if (this.persisted.device?.key) {
      params.DEVICE_KEY = this.persisted.device.key;
    }
    const result = await this.cognito.initiateAuth('REFRESH_TOKEN_AUTH', params);
    await this.storeAuthResult(result.AuthenticationResult);
    logger.debug('Hive session tokens renewed');
  }

  /** Full SRP login. Resolves once tokens are held; may throw SmsCodeRequiredError. */
  async login() {
    await this.init();
    if (!this.username || !this.password) {
      throw new HiveAuthError('missing_credentials', 'Hive email and password are required');
    }
    try {
      await this.srpLogin();
    } catch (err) {
      // A device the account forgot (removed from the Hive app...): log in
      // without it, Cognito will ask for an SMS code and hand out a new one.
      if (
        err instanceof CognitoError &&
        err.type === 'ResourceNotFoundException' &&
        this.persisted.device
      ) {
        logger.warn('The remembered Hive device is unknown to Hive, forgetting it');
        this.persisted.device = null;
        await this.save();
        return this.login();
      }
      throw mapCognitoError(err);
    }
  }

  async srpLogin() {
    const ephemeral = createEphemeral();
    const params = { USERNAME: this.username, SRP_A: ephemeral.srpA };
    if (this.persisted.device?.key) {
      params.DEVICE_KEY = this.persisted.device.key;
    }
    let response = await this.cognito.initiateAuth('USER_SRP_AUTH', params);
    let userId = this.username;
    let deviceEphemeral = null;

    // Walk the challenges until Cognito hands out tokens.
    for (let step = 0; step < 6; step += 1) {
      if (response.AuthenticationResult) {
        this.persisted.pending = null;
        await this.storeAuthResult(response.AuthenticationResult);
        logger.info('Logged in to Hive');
        return;
      }
      const challenge = response.ChallengeName;
      const parameters = response.ChallengeParameters ?? {};
      const timestamp = cognitoTimestamp(new Date(this.now()));

      if (challenge === 'PASSWORD_VERIFIER') {
        userId = parameters.USER_ID_FOR_SRP;
        const key = authenticationKey(
          ephemeral,
          `${this.poolName}${userId}`,
          this.password,
          parameters.SRP_B,
          parameters.SALT,
        );
        const answer = {
          USERNAME: userId,
          PASSWORD_CLAIM_SECRET_BLOCK: parameters.SECRET_BLOCK,
          PASSWORD_CLAIM_SIGNATURE: claimSignature(
            key,
            this.poolName,
            userId,
            parameters.SECRET_BLOCK,
            timestamp,
          ),
          TIMESTAMP: timestamp,
        };
        if (this.persisted.device?.key) {
          answer.DEVICE_KEY = this.persisted.device.key;
        }
        response = await this.cognito.respondToAuthChallenge(challenge, answer, response.Session);
      } else if (challenge === 'DEVICE_SRP_AUTH') {
        // The remembered device proves itself: no SMS.
        deviceEphemeral = createEphemeral();
        response = await this.cognito.respondToAuthChallenge(
          challenge,
          { USERNAME: userId, SRP_A: deviceEphemeral.srpA, DEVICE_KEY: this.persisted.device.key },
          response.Session,
        );
      } else if (challenge === 'DEVICE_PASSWORD_VERIFIER') {
        const { groupKey, key: deviceKey, password } = this.persisted.device;
        const key = authenticationKey(
          deviceEphemeral,
          `${groupKey}${deviceKey}`,
          password,
          parameters.SRP_B,
          parameters.SALT,
        );
        response = await this.cognito.respondToAuthChallenge(
          challenge,
          {
            USERNAME: parameters.USERNAME ?? userId,
            PASSWORD_CLAIM_SECRET_BLOCK: parameters.SECRET_BLOCK,
            PASSWORD_CLAIM_SIGNATURE: claimSignature(
              key,
              groupKey,
              deviceKey,
              parameters.SECRET_BLOCK,
              timestamp,
            ),
            TIMESTAMP: timestamp,
            DEVICE_KEY: deviceKey,
          },
          response.Session,
        );
      } else if (challenge === 'SMS_MFA') {
        this.persisted.pending = {
          session: response.Session,
          userId: parameters.USER_ID_FOR_SRP ?? userId,
          destination: parameters.CODE_DELIVERY_DESTINATION ?? null,
          createdAt: this.now(),
        };
        await this.save();
        logger.info('Hive sent an SMS code: waiting for it in the configuration');
        throw new SmsCodeRequiredError(this.persisted.pending.destination);
      } else {
        throw new HiveAuthError(
          'unsupported_challenge',
          `Unsupported Hive login step: ${challenge}`,
        );
      }
    }
    throw new HiveAuthError('unavailable', 'Hive login did not complete');
  }

  /**
   * Answer the pending SMS challenge, then register this integration as a
   * remembered device so the following logins need no code.
   * @param {string} code
   */
  async submitSmsCode(code) {
    await this.init();
    const pending = this.pendingSms();
    if (!pending) {
      throw new HiveAuthError('sms_expired', 'The SMS code request expired');
    }
    // A code is single use: remembered so a later challenge does not resend it.
    this.persisted.lastSmsCode = String(code).trim();
    await this.save();
    try {
      const response = await this.cognito.respondToAuthChallenge(
        'SMS_MFA',
        { SMS_MFA_CODE: String(code).trim(), USERNAME: pending.userId },
        pending.session,
      );
      if (!response.AuthenticationResult) {
        throw new HiveAuthError(
          'unsupported_challenge',
          `Unsupported Hive login step: ${response.ChallengeName}`,
        );
      }
      this.persisted.pending = null;
      await this.storeAuthResult(response.AuthenticationResult);
      logger.info('SMS code accepted, logged in to Hive');
    } catch (err) {
      if (err instanceof CognitoError) {
        if (err.type === 'CodeMismatchException') {
          throw new HiveAuthError('invalid_sms_code', 'Wrong SMS code');
        }
        if (err.type === 'NotAuthorizedException' || err.type === 'ExpiredCodeException') {
          this.persisted.pending = null;
          await this.save();
          throw new HiveAuthError('sms_expired', 'The SMS code request expired');
        }
        throw mapCognitoError(err);
      }
      throw err;
    }
  }

  async storeAuthResult(result) {
    this.tokens = {
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      expiresAt: this.now() + (result.ExpiresIn ?? 3600) * 1000,
    };
    if (result.RefreshToken) {
      this.persisted.refreshToken = result.RefreshToken;
    }
    if (result.NewDeviceMetadata) {
      await this.rememberDevice(result.NewDeviceMetadata);
    }
    await this.save();
  }

  async rememberDevice({ DeviceGroupKey: groupKey, DeviceKey: key }) {
    const { devicePassword, verifierConfig } = generateDeviceSecret(groupKey, key);
    try {
      await this.cognito.confirmDevice(this.tokens.accessToken, key, DEVICE_NAME, verifierConfig);
      await this.cognito.updateDeviceStatus(this.tokens.accessToken, key, 'remembered');
      this.persisted.device = { groupKey, key, password: devicePassword };
      logger.info('Gladys is now a remembered device of the Hive account');
    } catch (err) {
      // Not fatal: the session works, the next login will just ask for a code.
      logger.warn(`Could not register Gladys as a remembered Hive device (${err.message})`);
    }
  }

  /** Forget the remembered device and the session: the next login asks for an SMS code. */
  async reset() {
    await this.init();
    this.tokens = null;
    this.persisted = {
      username: this.username,
      device: null,
      refreshToken: null,
      pending: null,
      // Still used: never submit it again.
      lastSmsCode: this.persisted.lastSmsCode,
    };
    await this.save();
  }

  async save() {
    await this.store.save({ ...this.persisted });
  }
}
