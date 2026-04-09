import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const DATA_DIR = path.join(os.homedir(), '.suki');
const KEYS_FILE = path.join(DATA_DIR, 'keys.enc');

function getMachineKey(salt: Buffer): Buffer {
  return crypto.scryptSync(os.hostname() + os.userInfo().username, salt, 32);
}

export function saveKeys(keys: Record<string, string>): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMachineKey(salt), iv);
    const plaintext = JSON.stringify(keys);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.writeFileSync(KEYS_FILE, Buffer.concat([salt, iv, tag, enc]));
    console.log('[KeysService] Keys saved successfully to', KEYS_FILE);
    console.log('[KeysService] Keys saved for providers:', Object.keys(keys).filter(key => keys[key]));
  } catch (err) {
    console.error('[KeysService] Failed to save keys:', err);
    throw err;
  }
}

export function loadKeys(): Record<string, string> {
  try {
    if (!fs.existsSync(KEYS_FILE)) {
      console.log('[KeysService] No keys file found at', KEYS_FILE);
      return {};
    }
    const buf = fs.readFileSync(KEYS_FILE);
    const dec = crypto.createDecipheriv('aes-256-gcm', getMachineKey(buf.subarray(0, 16)), buf.subarray(16, 28));
    dec.setAuthTag(buf.subarray(28, 44));
    const result = JSON.parse(dec.update(buf.subarray(44), undefined, 'utf8') + dec.final('utf8')) as Record<string, string>;
    console.log('[KeysService] Keys loaded for providers:', Object.keys(result).filter(key => result[key]));
    return result;
  } catch (err) {
    console.error('[KeysService] Failed to load keys:', err);
    return {};
  }
}

export function hasKeys(): boolean { return fs.existsSync(KEYS_FILE); }
