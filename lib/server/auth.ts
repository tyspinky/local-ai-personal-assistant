import { cookies } from 'next/headers';

import { audit, getDb } from '@/lib/server/javis-db';

const sessionCookieName = 'javis_session';
const sessionDays = 30;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return toBase64(new Uint8Array(digest));
}

async function passwordHash(password: string, salt: string) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt),
      iterations: 210000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

function expiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + sessionDays);
  return date;
}

export async function isOwnerConfigured(db: D1Database) {
  const row = await db
    .prepare('SELECT id FROM owner_account WHERE id = 1')
    .first<{ id: number }>();
  return Boolean(row);
}

export async function createOwner({
  displayName,
  password,
  deviceLabel,
}: {
  displayName: string;
  password: string;
  deviceLabel: string;
}) {
  const db = await getDb();
  if (await isOwnerConfigured(db)) {
    throw new Error('Owner account is already configured.');
  }

  const salt = randomToken(16);
  const hash = await passwordHash(password, salt);

  await db
    .prepare(
      `INSERT INTO owner_account (id, display_name, password_hash, password_salt)
       VALUES (1, ?, ?, ?)`,
    )
    .bind(displayName, hash, salt)
    .run();

  await audit(db, 'auth.owner_created', 'owner_account', '1', {
    displayName,
  });

  return createSession({ db, deviceLabel });
}

export async function loginOwner({
  password,
  deviceLabel,
}: {
  password: string;
  deviceLabel: string;
}) {
  const db = await getDb();
  const owner = await db
    .prepare(
      `SELECT password_hash, password_salt
       FROM owner_account
       WHERE id = 1`,
    )
    .first<{ password_hash: string; password_salt: string }>();

  if (!owner) throw new Error('Owner account has not been created yet.');

  const hash = await passwordHash(password, owner.password_salt);
  if (hash !== owner.password_hash) {
    await audit(db, 'auth.login_failed', 'owner_account', '1', { deviceLabel });
    throw new Error('Incorrect owner password.');
  }

  await audit(db, 'auth.login', 'owner_account', '1', { deviceLabel });
  return createSession({ db, deviceLabel });
}

async function createSession({
  db,
  deviceLabel,
}: {
  db: D1Database;
  deviceLabel: string;
}) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const deviceId = await sha256(`${deviceLabel}:${token}`);
  const expiresAt = expiryDate();

  await db
    .prepare(
      `INSERT INTO approved_devices (device_id, label, approved, last_seen_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(device_id)
       DO UPDATE SET label = excluded.label, approved = 1, last_seen_at = CURRENT_TIMESTAMP`,
    )
    .bind(deviceId, deviceLabel || 'Approved device')
    .run();

  await db
    .prepare(
      `INSERT INTO auth_sessions (session_token_hash, device_id, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(tokenHash, deviceId, expiresAt.toISOString())
    .run();

  await audit(db, 'auth.device_approved', 'device', deviceId, { deviceLabel });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function requireOwner() {
  const db = await getDb();
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return { ok: false as const, status: 401, message: 'Login required.' };
  }

  const tokenHash = await sha256(token);
  const session = await db
    .prepare(
      `SELECT auth_sessions.id, auth_sessions.device_id
       FROM auth_sessions
       JOIN approved_devices
         ON approved_devices.device_id = auth_sessions.device_id
       WHERE session_token_hash = ?
         AND expires_at > CURRENT_TIMESTAMP
         AND approved_devices.approved = 1`,
    )
    .bind(tokenHash)
    .first<{ id: number; device_id: string }>();

  if (!session) {
    return { ok: false as const, status: 401, message: 'Session expired.' };
  }

  await db
    .prepare(
      `UPDATE auth_sessions
       SET last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(session.id)
    .run();
  await db
    .prepare(
      `UPDATE approved_devices
       SET last_seen_at = CURRENT_TIMESTAMP
       WHERE device_id = ?`,
    )
    .bind(session.device_id)
    .run();

  return { ok: true as const, db, deviceId: session.device_id };
}

export async function getAuthStatus() {
  const db = await getDb();
  const setupRequired = !(await isOwnerConfigured(db));
  const auth = setupRequired ? null : await requireOwner();

  return {
    setupRequired,
    authenticated: auth?.ok === true,
  };
}
