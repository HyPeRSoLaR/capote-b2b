import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const SECRET = process.env.SESSION_SECRET || 'default_capote_eyewear_secret_key_long_string_2026';
// Derive a 32-byte key from our secret using scrypt
const KEY = crypto.scryptSync(SECRET, 'capote_salt', 32);

export function encryptSession(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptSession(encryptedText) {
  if (!encryptedText) return null;
  try {
    const [ivHex, encryptedHex] = encryptedText.split(':');
    if (!ivHex || !encryptedHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Session decryption failed:', err.message);
    return null;
  }
}

const ALL_WAREHOUSES = ['barcelona', 'japan', 'canada'];

function getCountryWarehouse(countryCode) {
  const country = String(countryCode || 'ES').toUpperCase();
  if (country === 'CA') return 'canada';
  if (country === 'JP') return 'japan';
  return 'barcelona';
}

function getWarehouseTags(tags = []) {
  const matched = new Set();
  for (const t of tags) {
    const m = String(t).trim().match(/^warehouse-(barcelona|japan|canada)$/i);
    if (m) {
      matched.add(m[1].toLowerCase());
    }
  }
  return ALL_WAREHOUSES.filter(w => matched.has(w));
}

// ---------------------------------------------------------------------------
// Regional sourcing rules — single source of truth
// Mirrors the resolution in /api/auth/session so both the UI session payload
// and server-side order enforcement derive the warehouse identically.
// ---------------------------------------------------------------------------
export function resolveWarehouse(session) {
  const countryWh = getCountryWarehouse(session?.countryCode);
  const whTags = getWarehouseTags(session?.tags);

  if (whTags.length >= 2) {
    if (whTags.includes(countryWh)) return countryWh;
    return whTags[0];
  }

  if (whTags.length === 1) {
    return whTags[0];
  }

  // Check legacy non-prefixed warehouse tags (barcelona, japan, canada)
  for (const tag of (session?.tags || [])) {
    const lt = String(tag).trim().toLowerCase();
    if (lt === 'barcelona') return 'barcelona';
    if (lt === 'japan') return 'japan';
    if (lt === 'canada') return 'canada';
  }

  return countryWh;
}

export function isAdminSession(session) {
  const tags = session?.tags || [];
  const hasAdminTag = tags.some(t => ['b2b-admin', 'admin'].includes(String(t).toLowerCase()));
  return hasAdminTag && !session?.impersonatedBy;
}

export function allowedWarehouses(session) {
  if (isAdminSession(session)) return ['barcelona', 'japan', 'canada'];
  const tags = session?.tags || [];
  if (tags.some(t => String(t).trim().toLowerCase() === 'warehouse-any')) {
    return ['barcelona', 'japan', 'canada'];
  }
  const whTags = getWarehouseTags(tags);
  if (whTags.length >= 2) {
    return whTags;
  }
  if (whTags.length === 1) {
    return [whTags[0]];
  }
  return [resolveWarehouse(session).toLowerCase()];
}

export { isAgentSession } from './roles.js';
