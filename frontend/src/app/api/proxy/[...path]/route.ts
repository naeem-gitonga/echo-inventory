import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_GATEWAY_URL ?? 'http://localhost:3001';
const IS_PROD = process.env.NODE_ENV === 'production';

const COOKIE_OPTS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: IS_PROD,
};

async function proxy(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname.replace('/api/proxy', '');
  const url  = `${API_URL}${path}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete('host');

  // Inject id_token from cookie as Bearer header for protected routes
  const idToken = req.cookies.get('id_token')?.value;
  if (idToken) headers.set('authorization', `Bearer ${idToken}`);

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method:  req.method,
      headers,
      body: body as BodyInit | undefined,
    });
  } catch (e: unknown) {
    const isConnErr = e instanceof TypeError && /ECONNREFUSED|ECONNRESET|fetch failed/i.test((e as Error).message);
    if (isConnErr) {
      return NextResponse.json({ error: 'API unavailable' }, { status: 503 });
    }
    throw e;
  }

  // ── Auth cookie management ─────────────────────────────────────────────────
  // The Lambda returns tokens in the JSON body; the proxy sets HttpOnly cookies.
  // This avoids serverless-offline/Hapi cookie handling issues.

  if ((path === '/auth/login' || path === '/auth/set-password') && req.method === 'POST' && upstream.ok) {
    const data = await upstream.json();
    if (data.challenge) {
      // NEW_PASSWORD_REQUIRED — no tokens yet, pass challenge through
      return NextResponse.json(data, { status: 200 });
    }
    const res = NextResponse.json({ message: data.message }, { status: 200 });
    res.cookies.set('id_token',      data.idToken,      { ...COOKIE_OPTS, maxAge: 3600 });
    res.cookies.set('refresh_token', data.refreshToken, { ...COOKIE_OPTS, maxAge: 2592000 });
    return res;
  }

  if (path === '/auth/refresh' && req.method === 'POST' && upstream.ok) {
    const data = await upstream.json();
    const res = NextResponse.json({ message: data.message }, { status: 200 });
    res.cookies.set('id_token', data.idToken, { ...COOKIE_OPTS, maxAge: 3600 });
    return res;
  }

  if (path === '/auth/logout' && req.method === 'POST') {
    const res = NextResponse.json({ message: 'Signed out' }, { status: 200 });
    res.cookies.set('id_token',      '', { ...COOKIE_OPTS, maxAge: 0 });
    res.cookies.set('refresh_token', '', { ...COOKIE_OPTS, maxAge: 0 });
    return res;
  }

  // ── Generic proxy ──────────────────────────────────────────────────────────

  const nextRes = new NextResponse(upstream.body, { status: upstream.status });

  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'transfer-encoding') return;
    if (k === 'content-encoding') return;
    if (k === 'set-cookie') return;
    nextRes.headers.set(key, value);
  });

  return nextRes;
}

export const GET     = proxy;
export const POST    = proxy;
export const PATCH   = proxy;
export const PUT     = proxy;
export const DELETE  = proxy;
export const OPTIONS = proxy;
