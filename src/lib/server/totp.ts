import "server-only";
// Authenticator-app codes (RFC 6238: 6 digits, 30-second steps, HMAC-SHA1) and one-time recovery codes.
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(randomBytes(20));

function codeAt(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** True if the code matches now, or one step either side (clock drift). */
export function verifyCode(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(codeAt(secret, step + d)), Buffer.from(c)));
}

/** For tests and the setup screen's sanity check. */
export const currentCode = (secret: string, now = Date.now()) => codeAt(secret, Math.floor(now / 30_000));

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Eight one-time codes, shown once; only their hashes are kept. */
export async function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const s = base32(randomBytes(5)).toLowerCase();
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
  return { codes, hashes: await Promise.all(codes.map((c) => bcrypt.hash(c, 10))) };
}

/** Uses up a recovery code: returns the remaining hashes, or null if it didn't match any. */
export async function useRecoveryCode(hashes: string[], code: string) {
  const c = code.trim().toLowerCase();
  if (!/^[a-z2-7]{4}-[a-z2-7]{4}$/.test(c)) return null;
  for (let i = 0; i < hashes.length; i++) if (await bcrypt.compare(c, hashes[i])) return hashes.filter((_, j) => j !== i);
  return null;
}

// a few wrong codes in a row lock that person's code entry for a while
const failures = new Map<string, { n: number; until: number }>();
export function tooManyTries(userId: string) {
  const f = failures.get(userId);
  return !!f && f.until > Date.now() && f.n >= 5;
}
export function recordFailure(userId: string) {
  const f = failures.get(userId);
  const n = f && f.until > Date.now() ? f.n + 1 : 1;
  failures.set(userId, { n, until: Date.now() + 15 * 60_000 });
}
export const clearFailures = (userId: string) => failures.delete(userId);
