import { getDatabase } from '@netlify/database';

let _db;
export const db = () => _db || (_db = getDatabase());

const cache = new Map();
export async function getSetting(key, ttl = 30000) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  const rows = await db().sql`SELECT value FROM settings WHERE key = ${key}`;
  const v = rows.length ? rows[0].value : null;
  cache.set(key, { v, t: Date.now() });
  return v;
}
export async function setSetting(key, value) {
  await db().sql`INSERT INTO settings (key, value) VALUES (${key}, ${String(value)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  cache.delete(key); allCache = null;
}
let allCache = null;
export async function getAllSettings(ttl = 20000) {
  if (allCache && Date.now() - allCache.t < ttl) return allCache.v;
  const rows = await db().sql`SELECT key, value FROM settings`;
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  allCache = { t: Date.now(), v };
  return v;
}
export const dropSettingsCache = () => { cache.clear(); allCache = null; };

export async function tooMany(ip, kind) {
  const rows = await db().sql`SELECT COUNT(*)::int AS c FROM intentos WHERE ip = ${ip} AND kind = ${kind} AND ts > ${Date.now() - 15 * 60 * 1000}`;
  return rows[0].c >= (kind === 'a' ? 8 : 600);
}
export async function registerFail(ip, kind) {
  await db().sql`INSERT INTO intentos (ip, kind, ts) VALUES (${ip}, ${kind}, ${Date.now()})`;
  await db().sql`DELETE FROM intentos WHERE ts < ${Date.now() - 24 * 3600 * 1000}`;
}
