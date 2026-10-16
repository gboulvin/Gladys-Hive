// -----------------------------------------------------------------------------
// An in-memory Hive cloud for the tests, behind a `fetch` replacement:
//   - the SSO page (Cognito pool and client ids);
//   - a Cognito user pool that runs the SERVER side of SRP, so the client's
//     password and device proofs are really verified, with SMS MFA and
//     remembered devices;
//   - the beekeeper API (nodes/all, product commands, actions).
// Tests never touch the network.
// -----------------------------------------------------------------------------

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { computeHkdf, G, K, modPow, N, padHex } from '../../src/hive/srp.js';

export const POOL_ID = 'eu-west-1_TestPool';
export const CLIENT_ID = 'test-client-id';
export const USERNAME = 'me@example.com';
export const PASSWORD = 'correct horse battery staple';
export const SMS_CODE = '123456';

const POOL_NAME = POOL_ID.split('_')[1];
const USER_ID = 'user-sub-0001';

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hexHash = (hex) => sha256Hex(Buffer.from(hex, 'hex'));
const big = (hex) => BigInt(`0x${hex}`);

export const loadFixture = () =>
  JSON.parse(readFileSync(new URL('../fixtures/home.json', import.meta.url), 'utf8'));

function verifierOf(saltHex, identity, secret) {
  const x = big(hexHash(padHex(big(saltHex)) + sha256Hex(`${identity}:${secret}`)));
  return modPow(G, x, N);
}

/** Server half of an SRP handshake: B, and the check of the client's proof. */
function serverHandshake(verifier) {
  const b = big(randomBytes(64).toString('hex'));
  const B = (K * verifier + modPow(G, b, N)) % N;
  return {
    srpB: B.toString(16),
    expectedSignature(srpAHex, prefix, name, secretBlock, timestamp) {
      const A = big(srpAHex);
      const u = big(hexHash(padHex(A) + padHex(B)));
      const S = modPow(A * modPow(verifier, u, N), b, N);
      const key = computeHkdf(Buffer.from(padHex(S), 'hex'), Buffer.from(padHex(u), 'hex'));
      return createHmac('sha256', key)
        .update(
          Buffer.concat([
            Buffer.from(prefix),
            Buffer.from(name),
            Buffer.from(secretBlock, 'base64'),
            Buffer.from(timestamp),
          ]),
        )
        .digest('base64');
    },
  };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const cognitoError = (type, message) => json(400, { __type: type, message });

/**
 * @param {{ mfa?: boolean, password?: string }} [options]
 */
export function createFakeHive({ mfa = true, password = PASSWORD } = {}) {
  const userSalt = randomBytes(16).toString('hex');
  const userVerifier = verifierOf(userSalt, `${POOL_NAME}${USER_ID}`, password);
  const sessions = new Map();
  const remembered = new Map(); // deviceKey -> { groupKey, salt, verifier, status }
  let tokenCounter = 0;
  const validRefreshTokens = new Set();
  const validIdTokens = new Set();

  const state = {
    home: loadFixture(),
    calls: [],
    commands: [],
    smsSent: 0,
    remembered,
    ssoAvailable: true,
    beekeeperDown: false,
    expireRefreshTokens() {
      validRefreshTokens.clear();
    },
    revokeIdTokens() {
      validIdTokens.clear();
    },
  };

  function issueTokens({ withRefresh = true, newDevice = false } = {}) {
    tokenCounter += 1;
    const idToken = `id-token-${tokenCounter}`;
    validIdTokens.add(idToken);
    const result = {
      IdToken: idToken,
      AccessToken: `access-token-${tokenCounter}`,
      ExpiresIn: 3600,
    };
    if (withRefresh) {
      result.RefreshToken = `refresh-token-${tokenCounter}`;
      validRefreshTokens.add(result.RefreshToken);
    }
    if (newDevice) {
      result.NewDeviceMetadata = {
        DeviceGroupKey: '-groupKey1',
        DeviceKey: `eu-west-1_device-${tokenCounter}`,
      };
    }
    return { AuthenticationResult: result };
  }

  function newSession(data) {
    const id = `session-${randomBytes(4).toString('hex')}`;
    sessions.set(id, data);
    return id;
  }

  function cognito(target, body) {
    const op = target.split('.').pop();
    if (body.ClientId !== undefined && body.ClientId !== CLIENT_ID) {
      return cognitoError('ResourceNotFoundException', 'Unknown client');
    }

    if (op === 'InitiateAuth' && body.AuthFlow === 'USER_SRP_AUTH') {
      if (body.AuthParameters.USERNAME !== USERNAME) {
        return cognitoError('UserNotFoundException', 'User does not exist.');
      }
      const handshake = serverHandshake(userVerifier);
      const secretBlock = randomBytes(32).toString('base64');
      const session = newSession({
        step: 'PASSWORD_VERIFIER',
        handshake,
        srpA: body.AuthParameters.SRP_A,
        secretBlock,
        deviceKey: body.AuthParameters.DEVICE_KEY,
      });
      return json(200, {
        ChallengeName: 'PASSWORD_VERIFIER',
        Session: session,
        ChallengeParameters: {
          USER_ID_FOR_SRP: USER_ID,
          USERNAME: USER_ID,
          SALT: userSalt,
          SRP_B: handshake.srpB,
          SECRET_BLOCK: secretBlock,
        },
      });
    }

    if (op === 'InitiateAuth' && body.AuthFlow === 'REFRESH_TOKEN_AUTH') {
      if (!validRefreshTokens.has(body.AuthParameters.REFRESH_TOKEN)) {
        return cognitoError('NotAuthorizedException', 'Invalid Refresh Token');
      }
      return json(200, issueTokens({ withRefresh: false }));
    }

    if (op === 'RespondToAuthChallenge') {
      const session = sessions.get(body.Session);
      if (!session || session.step !== body.ChallengeName) {
        return cognitoError('NotAuthorizedException', 'Invalid session for the user.');
      }
      sessions.delete(body.Session);
      const answer = body.ChallengeResponses;

      if (body.ChallengeName === 'PASSWORD_VERIFIER') {
        const expected = session.handshake.expectedSignature(
          session.srpA,
          POOL_NAME,
          USER_ID,
          answer.PASSWORD_CLAIM_SECRET_BLOCK,
          answer.TIMESTAMP,
        );
        if (answer.USERNAME !== USER_ID || answer.PASSWORD_CLAIM_SIGNATURE !== expected) {
          return cognitoError('NotAuthorizedException', 'Incorrect username or password.');
        }
        const deviceKey = answer.DEVICE_KEY ?? session.deviceKey;
        if (deviceKey) {
          if (!remembered.has(deviceKey)) {
            return cognitoError('ResourceNotFoundException', 'Device does not exist.');
          }
          return json(200, {
            ChallengeName: 'DEVICE_SRP_AUTH',
            Session: newSession({ step: 'DEVICE_SRP_AUTH', deviceKey }),
            ChallengeParameters: {},
          });
        }
        if (mfa) {
          state.smsSent += 1;
          return json(200, {
            ChallengeName: 'SMS_MFA',
            Session: newSession({ step: 'SMS_MFA' }),
            ChallengeParameters: {
              CODE_DELIVERY_DESTINATION: '+*******1234',
              CODE_DELIVERY_DELIVERY_MEDIUM: 'SMS',
            },
          });
        }
        return json(200, issueTokens());
      }

      if (body.ChallengeName === 'SMS_MFA') {
        if (answer.SMS_MFA_CODE !== SMS_CODE || answer.USERNAME !== USER_ID) {
          // A wrong code keeps the session open, as Cognito does.
          sessions.set(body.Session, session);
          return cognitoError('CodeMismatchException', 'Invalid code received for user');
        }
        return json(200, issueTokens({ newDevice: true }));
      }

      if (body.ChallengeName === 'DEVICE_SRP_AUTH') {
        const device = remembered.get(answer.DEVICE_KEY);
        if (!device || device.status !== 'remembered') {
          return cognitoError('ResourceNotFoundException', 'Device does not exist.');
        }
        const handshake = serverHandshake(device.verifier);
        const secretBlock = randomBytes(32).toString('base64');
        return json(200, {
          ChallengeName: 'DEVICE_PASSWORD_VERIFIER',
          Session: newSession({
            step: 'DEVICE_PASSWORD_VERIFIER',
            handshake,
            srpA: answer.SRP_A,
            secretBlock,
            deviceKey: answer.DEVICE_KEY,
          }),
          ChallengeParameters: {
            USERNAME: USER_ID,
            SALT: device.salt,
            SRP_B: handshake.srpB,
            SECRET_BLOCK: secretBlock,
          },
        });
      }

      if (body.ChallengeName === 'DEVICE_PASSWORD_VERIFIER') {
        const device = remembered.get(session.deviceKey);
        const expected = session.handshake.expectedSignature(
          session.srpA,
          device.groupKey,
          session.deviceKey,
          answer.PASSWORD_CLAIM_SECRET_BLOCK,
          answer.TIMESTAMP,
        );
        if (answer.PASSWORD_CLAIM_SIGNATURE !== expected) {
          return cognitoError('NotAuthorizedException', 'Incorrect device proof.');
        }
        return json(200, issueTokens());
      }
    }

    if (op === 'ConfirmDevice') {
      const salt = Buffer.from(body.DeviceSecretVerifierConfig.Salt, 'base64').toString('hex');
      const verifier = big(
        Buffer.from(body.DeviceSecretVerifierConfig.PasswordVerifier, 'base64').toString('hex'),
      );
      remembered.set(body.DeviceKey, {
        groupKey: '-groupKey1',
        salt,
        verifier,
        name: body.DeviceName,
        status: 'not_remembered',
      });
      return json(200, { UserConfirmationNecessary: false });
    }

    if (op === 'UpdateDeviceStatus') {
      const device = remembered.get(body.DeviceKey);
      if (!device) {
        return cognitoError('ResourceNotFoundException', 'Device does not exist.');
      }
      device.status = body.DeviceRememberedStatus;
      return json(200, {});
    }

    return cognitoError('InvalidParameterException', `Unsupported ${op}`);
  }

  function beekeeper(url, init) {
    if (state.beekeeperDown) {
      return json(503, { error: 'down' });
    }
    if (!validIdTokens.has(init.headers.Authorization)) {
      return json(401, { error: 'NOT_AUTHORIZED' });
    }
    const path = url.pathname.replace('/1.0', '');
    const method = init.method ?? 'GET';
    if (method === 'GET' && path === '/nodes/all') {
      return json(200, structuredClone(state.home));
    }
    const node = path.match(/^\/nodes\/([^/]+)\/([^/]+)$/);
    if (method === 'POST' && node) {
      const fields = JSON.parse(init.body);
      state.commands.push({ type: node[1], id: node[2], fields });
      const product = state.home.products.find((p) => p.id === node[2] && p.type === node[1]);
      if (!product) {
        return json(404, { error: 'NOT_FOUND' });
      }
      product.state = { ...product.state, ...fields };
      return json(200, [product]);
    }
    const action = path.match(/^\/actions\/([^/]+)$/);
    if (method === 'PUT' && action) {
      const body = JSON.parse(init.body);
      state.commands.push({ action: action[1], body });
      const index = state.home.actions.findIndex((a) => a.id === action[1]);
      state.home.actions[index] = body;
      return json(200, body);
    }
    return json(404, { error: 'NOT_FOUND' });
  }

  async function fetchImpl(input, init = {}) {
    const url = new URL(String(input));
    state.calls.push({ host: url.host, target: init.headers?.['X-Amz-Target'] ?? url.pathname });
    if (url.host === 'sso.hivehome.com') {
      if (!state.ssoAvailable) {
        throw new TypeError('fetch failed');
      }
      return new Response(
        `<html><head><script>window.HiveSSOPoolId="${POOL_ID}",window.HiveSSOPublicCognitoClientId="${CLIENT_ID}"</script></head></html>`,
      );
    }
    if (url.host === 'cognito-idp.eu-west-1.amazonaws.com') {
      return cognito(init.headers['X-Amz-Target'], JSON.parse(init.body));
    }
    if (url.host === 'beekeeper.hivehome.com') {
      return beekeeper(url, init);
    }
    throw new TypeError(`fetch failed: unexpected host ${url.host}`);
  }

  return { fetchImpl, state };
}
