export interface AuthUser {
  userId:  string;
  email:   string;
  orgName?: string;
}

async function authFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`/api/proxy${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

export const signUp = (email: string, password: string, orgName: string) =>
  authFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, orgName }) });

export const confirmSignUp = (email: string, code: string, password?: string, orgName?: string) =>
  authFetch('/auth/confirm', { method: 'POST', body: JSON.stringify({ email, code, password, orgName }) });

export const signIn = (email: string, password: string): Promise<{ message: string }> =>
  authFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const refresh = (): Promise<{ message: string }> =>
  authFetch('/auth/refresh', { method: 'POST' });

export const signOut = (): Promise<{ message: string }> =>
  authFetch('/auth/logout', { method: 'POST' });

export const getMe = (): Promise<AuthUser> =>
  authFetch('/auth/me');
