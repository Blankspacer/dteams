export const USERNAME_REGEX = /^[a-z0-9_.-]{3,30}$/;

const PENDING_USERNAME_STORAGE_KEY = 'spherecall_pending_signup_username';

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 30);
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function deriveDefaultUsername(seed: string, uid: string): string {
  const baseRaw = (seed.includes('@') ? seed.split('@')[0] : seed)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
  const suffix = uid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 4) || 'user';
  const base = baseRaw.slice(0, 24);
  const candidate = base.length >= 3 ? base : `user_${suffix}`;
  return candidate.slice(0, 30);
}

export function savePendingSignupUsername(email: string, username: string): void {
  const clean = normalizeUsername(username);
  if (!clean || !isValidUsername(clean)) return;
  try {
    localStorage.setItem(
      PENDING_USERNAME_STORAGE_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), username: clean })
    );
  } catch {
    // Ignore storage error
  }
}

export function consumePendingSignupUsername(email?: string | null): string | null {
  try {
    const raw = localStorage.getItem(PENDING_USERNAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; username?: string };
    if (
      email &&
      parsed.email &&
      parsed.email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      return null;
    }
    const clean = parsed.username ? normalizeUsername(parsed.username) : '';
    localStorage.removeItem(PENDING_USERNAME_STORAGE_KEY);
    return isValidUsername(clean) ? clean : null;
  } catch {
    return null;
  }
}
