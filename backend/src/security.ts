import { randomBytes, createHash, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { invariant } from './errors.js';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1') return false;
  const key = await derive(password, parts[4]!);
  const stored = Buffer.from(parts[5]!, 'hex');
  return stored.length === key.length && timingSafeEqual(stored, key);
}
export function verifyTelegram(data: Record<string, string>, botToken: string, now = Date.now()) {
  invariant(
    /^\d+$/.test(data.id ?? '') && /^\d+$/.test(data.auth_date ?? ''),
    'INVALID_TELEGRAM_IDENTITY',
    401,
  );
  const age = now / 1000 - Number(data.auth_date);
  invariant(age >= -30 && age < 300, 'TELEGRAM_IDENTITY_EXPIRED', 401);
  const check = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const signature = createHmac('sha256', createHash('sha256').update(botToken).digest())
    .update(check)
    .digest();
  const supplied = Buffer.from(data.hash ?? '', 'hex');
  invariant(
    supplied.length === signature.length && timingSafeEqual(supplied, signature),
    'INVALID_TELEGRAM_SIGNATURE',
    401,
  );
  return data.id!;
}
