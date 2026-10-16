// -----------------------------------------------------------------------------
// Minimal AWS Cognito Identity Provider client (JSON 1.1 protocol over fetch).
//
// Every call Hive needs is public: InitiateAuth and RespondToAuthChallenge
// are unauthenticated, ConfirmDevice and UpdateDeviceStatus carry the user's
// access token in the body. No AWS signature, no AWS SDK.
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;

/** A Cognito error answer: `type` is the exception name (NotAuthorizedException...). */
export class CognitoError extends Error {
  constructor(type, message, status) {
    super(`${type}: ${message}`);
    this.name = 'CognitoError';
    this.type = type;
    this.status = status;
  }
}

/**
 * @param {{ region: string, clientId: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createCognitoClient({
  region,
  clientId,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  async function call(operation, body) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new CognitoError('NetworkError', err.message, 0);
    }
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      // `__type` may carry a namespace prefix ("com.amazon...#NotAuthorizedException").
      const type = String(json.__type ?? 'UnknownError')
        .split('#')
        .pop();
      throw new CognitoError(type, json.message ?? json.Message ?? text, response.status);
    }
    return json;
  }

  return {
    clientId,
    region,
    call,
    initiateAuth(authFlow, authParameters) {
      return call('InitiateAuth', {
        AuthFlow: authFlow,
        ClientId: clientId,
        AuthParameters: authParameters,
      });
    },
    respondToAuthChallenge(challengeName, challengeResponses, session) {
      return call('RespondToAuthChallenge', {
        ChallengeName: challengeName,
        ClientId: clientId,
        ChallengeResponses: challengeResponses,
        ...(session ? { Session: session } : {}),
      });
    },
    confirmDevice(accessToken, deviceKey, deviceName, verifierConfig) {
      return call('ConfirmDevice', {
        AccessToken: accessToken,
        DeviceKey: deviceKey,
        DeviceName: deviceName,
        DeviceSecretVerifierConfig: verifierConfig,
      });
    },
    updateDeviceStatus(accessToken, deviceKey, status) {
      return call('UpdateDeviceStatus', {
        AccessToken: accessToken,
        DeviceKey: deviceKey,
        DeviceRememberedStatus: status,
      });
    },
  };
}
