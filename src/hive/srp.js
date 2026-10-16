// -----------------------------------------------------------------------------
// AWS Cognito SRP (Secure Remote Password) maths, with native BigInt and
// node:crypto only: Hive accounts live in a Cognito user pool, whose login
// never sends the password, only an SRP proof of it.
//
// A port of the AuthenticationHelper of amazon-cognito-identity-js (the
// reference the Hive mobile apps and Home Assistant's pyhiveapi follow):
//   - the user proof (PASSWORD_VERIFIER challenge);
//   - the device proof (DEVICE_PASSWORD_VERIFIER challenge), which lets a
//     remembered device log in again without a new SMS code;
//   - the verifier registered for a new device (ConfirmDevice).
// test/srp.test.js checks every formula against an independent computation.
// -----------------------------------------------------------------------------

import { createHash, createHmac, randomBytes } from 'node:crypto';

// RFC 5054 3072-bit group, the one Cognito uses (g = 2).
const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
  '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
  'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
  'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
  'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
  '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
  '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' +
  'DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
  '15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64' +
  'ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7' +
  'ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6B' +
  'F12FFA06D98A0864D87602733EC86A64521F2B18177B200C' +
  'BBE117577A615D6C770988C0BAD946E208E24FA074E5AB31' +
  '43DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF';

export const N = BigInt(`0x${N_HEX}`);
export const G = 2n;
const INFO = Buffer.from('Caldera Derived Key', 'utf8');

/** Modular exponentiation (square-and-multiply) on BigInt. */
export function modPow(base, exponent, modulus) {
  let result = 1n;
  let b = ((base % modulus) + modulus) % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

/**
 * Hex of a positive integer as Cognito hashes it: an even number of digits,
 * and a leading 00 when the first digit would set the sign bit.
 * @param {bigint | string} value
 */
export function padHex(value) {
  let hex = typeof value === 'bigint' ? value.toString(16) : value;
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  } else if ('89abcdefABCDEF'.includes(hex[0])) {
    hex = `00${hex}`;
  }
  return hex;
}

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hexHash = (hex) => sha256Hex(Buffer.from(hex, 'hex'));
const hexToBigInt = (hex) => BigInt(`0x${hex}`);

// k = H(N | g), a constant of the group.
export const K = hexToBigInt(hexHash(padHex(N) + padHex(G)));

/** HKDF-SHA256 with Cognito's fixed info string, truncated to 16 bytes. */
export function computeHkdf(ikm, salt) {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk)
    .update(Buffer.concat([INFO, Buffer.from([1])]))
    .digest()
    .subarray(0, 16);
}

/**
 * Cognito's timestamp: "Thu Oct 15 9:05:01 UTC 2026" — the day of the month
 * is NOT zero-padded, the time is.
 * @param {Date} [date]
 */
export function cognitoTimestamp(date = new Date()) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${date.getUTCDate()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} ` +
    `UTC ${date.getUTCFullYear()}`
  );
}

/**
 * A fresh client ephemeral (a, A). Never reuse one across two handshakes.
 * @param {bigint} [smallA] - injected by the tests only
 */
export function createEphemeral(smallA) {
  const a = smallA ?? hexToBigInt(randomBytes(128).toString('hex')) % N;
  const A = modPow(G, a, N);
  if (A % N === 0n) {
    throw new Error('SRP safety check failed (A mod N = 0)');
  }
  return { a, A, srpA: A.toString(16) };
}

/**
 * Shared session key of an SRP handshake.
 * @param {{ a: bigint, A: bigint }} ephemeral
 * @param {string} identity - "<poolName><userId>" or "<deviceGroupKey><deviceKey>"
 * @param {string} secret - the password, or the device password
 * @param {string} srpBHex - SRP_B of the challenge
 * @param {string} saltHex - SALT of the challenge
 */
export function authenticationKey(ephemeral, identity, secret, srpBHex, saltHex) {
  const B = hexToBigInt(srpBHex);
  if (B % N === 0n) {
    throw new Error('SRP safety check failed (B mod N = 0)');
  }
  const u = hexToBigInt(hexHash(padHex(ephemeral.A) + padHex(B)));
  if (u === 0n) {
    throw new Error('SRP safety check failed (u = 0)');
  }
  const identityHash = sha256Hex(Buffer.from(`${identity}:${secret}`, 'utf8'));
  // The salt goes through an integer, as in the reference implementation.
  const x = hexToBigInt(hexHash(padHex(hexToBigInt(saltHex)) + identityHash));
  const gx = modPow(G, x, N);
  const base = (((B - K * gx) % N) + N) % N;
  const S = modPow(base, ephemeral.a + u * x, N);
  return computeHkdf(Buffer.from(padHex(S), 'hex'), Buffer.from(padHex(u), 'hex'));
}

/**
 * PASSWORD_CLAIM_SIGNATURE of a (device) password verifier challenge.
 * @param {Buffer} key - from authenticationKey
 * @param {string} prefix - poolName (user proof) or deviceGroupKey (device proof)
 * @param {string} name - userId (user proof) or deviceKey (device proof)
 * @param {string} secretBlockB64 - SECRET_BLOCK of the challenge
 * @param {string} timestamp - from cognitoTimestamp
 */
export function claimSignature(key, prefix, name, secretBlockB64, timestamp) {
  return createHmac('sha256', key)
    .update(
      Buffer.concat([
        Buffer.from(prefix, 'utf8'),
        Buffer.from(name, 'utf8'),
        Buffer.from(secretBlockB64, 'base64'),
        Buffer.from(timestamp, 'utf8'),
      ]),
    )
    .digest('base64');
}

/**
 * Secret of a new device (ConfirmDevice): a random device password, and the
 * salt + verifier Cognito stores to check the device proofs later.
 * @param {string} deviceGroupKey
 * @param {string} deviceKey
 * @param {{ password?: string, salt?: string }} [fixed] - injected by the tests only
 */
export function generateDeviceSecret(deviceGroupKey, deviceKey, fixed = {}) {
  const devicePassword = fixed.password ?? randomBytes(40).toString('base64');
  const salt = padHex(hexToBigInt(fixed.salt ?? randomBytes(16).toString('hex')));
  const identityHash = sha256Hex(
    Buffer.from(`${deviceGroupKey}${deviceKey}:${devicePassword}`, 'utf8'),
  );
  const x = hexToBigInt(hexHash(salt + identityHash));
  const verifier = padHex(modPow(G, x, N));
  return {
    devicePassword,
    verifierConfig: {
      PasswordVerifier: Buffer.from(verifier, 'hex').toString('base64'),
      Salt: Buffer.from(salt, 'hex').toString('base64'),
    },
  };
}
