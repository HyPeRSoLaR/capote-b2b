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
