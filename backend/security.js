import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export function sessionCookie(token, config, clear = false) {
  return `radar_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : config.sessionHours * 3600}${config.cookieSecure ? '; Secure' : ''}`;
}
export function readToken(req) {
  return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('radar_session='))?.slice(14) || '';
}
