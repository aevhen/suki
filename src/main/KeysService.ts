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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMachineKey(salt), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(keys), 'utf8'), cipher.final()]);
  fs.writeFileSync(KEYS_FILE, Buffer.concat([salt, iv, cipher.getAuthTag(), enc]));
}

export function loadKeys(): Record<string, string> {
  if (!fs.existsSync(KEYS_FILE)) return {};
  const buf = fs.readFileSync(KEYS_FILE);
  const dec = crypto.createDecipheriv('aes-256-gcm', getMachineKey(buf.subarray(0, 16)), buf.subarray(16, 28));
  dec.setAuthTag(buf.subarray(28, 44));
  return JSON.parse(dec.update(buf.subarray(44), undefined, 'utf8') + dec.final('utf8'));
}

export function hasKeys(): boolean { return fs.existsSync(KEYS_FILE); }
