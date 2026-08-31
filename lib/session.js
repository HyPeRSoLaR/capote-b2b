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

// ---------------------------------------------------------------------------
// Regional sourcing rules — single source of truth
// Mirrors the resolution in /api/auth/session so both the UI session payload
// and server-side order enforcement derive the warehouse identically.
// ---------------------------------------------------------------------------
export function resolveWarehouse(session) {
  const country = session?.countryCode || 'ES';
  let warehouse = 'Barcelona';

  if (country === 'CA') warehouse = 'Canada';
  else if (country === 'JP') warehouse = 'Japan';
  else if (country === 'US') warehouse = 'Barcelona'; // Sourced from Barcelona, billed in USD

  for (const tag of (session?.tags || [])) {
    const lt = String(tag).toLowerCase();
    if (lt === 'warehouse-barcelona' || lt === 'barcelona') warehouse = 'Barcelona';
    else if (lt === 'warehouse-japan' || lt === 'japan') warehouse = 'Japan';
    else if (lt === 'warehouse-canada' || lt === 'canada') warehouse = 'Canada';
  }

  return warehouse;
}

export function isAdminSession(session) {
  const tags = session?.tags || [];
  const hasAdminTag = tags.some(t => ['b2b-admin', 'admin'].includes(String(t).toLowerCase()));
  return hasAdminTag && !session?.impersonatedBy;
}

export function isAgentSession(tags = []) {
  const tagList = Array.isArray(tags) ? tags : (tags?.tags || []);
  return tagList.some(t => {
    const lt = String(t).toLowerCase();
    return lt === 'agent' || lt === 'b2b-admin-agent';
  });
}
