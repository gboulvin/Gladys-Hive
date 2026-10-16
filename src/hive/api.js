// -----------------------------------------------------------------------------
// Hive "beekeeper" REST API: the cloud API the Hive apps use.
//
// One call reads the whole home (products, devices, actions); each command
// is a POST of the changed fields on one product node. The credential is the
// Cognito IdToken, renewed by HiveAuth.
// -----------------------------------------------------------------------------

export const API_BASE = 'https://beekeeper.hivehome.com/1.0';
const TIMEOUT_MS = 15_000;

export class HiveApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HiveApiError';
    this.status = status;
  }
}

/**
 * @param {{ auth: { getIdToken(): Promise<string>, invalidateTokens(): void }, fetchImpl?: typeof fetch }} options
 */
export function createHiveApi({ auth, fetchImpl = globalThis.fetch }) {
  async function request(method, path, body, retry = true) {
    const token = await auth.getIdToken();
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new HiveApiError(0, `Hive API unreachable: ${err.message}`);
    }
    if ((response.status === 401 || response.status === 403) && retry) {
      // Token revoked or expired early: renew once and retry.
      auth.invalidateTokens();
      return request(method, path, body, false);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new HiveApiError(
        response.status,
        `Hive API ${method} ${path.split('?')[0]} failed with HTTP ${response.status}`,
      );
    }
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  return {
    request,
    /** The whole home: `{ products, devices, actions, user, homes... }`. */
    getAll() {
      return request('GET', '/nodes/all?products=true&devices=true&actions=true');
    },
    /** Change a product: `setState('heating', id, { target: 21 })`. */
    setState(type, id, fields) {
      return request(
        'POST',
        `/nodes/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
        fields,
      );
    },
    /** Replace a Hive action (automation), e.g. to enable or disable it. */
    setAction(id, action) {
      return request('PUT', `/actions/${encodeURIComponent(id)}`, action);
    },
  };
}
