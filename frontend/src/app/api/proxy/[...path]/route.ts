import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_GATEWAY_URL ?? 'http://localhost:3001';

async function proxy(req: NextRequest): Promise<NextResponse> {
  // Strip /api/proxy prefix to get the real path
  const path = req.nextUrl.pathname.replace('/api/proxy', '');
  const url  = `${API_URL}${path}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete('host');

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined;

  const upstream = await fetch(url, {
    method:  req.method,
    headers,
    body: body as BodyInit | undefined,
  });

  const responseHeaders = new Headers(upstream.headers);
  // Remove transfer-encoding — Next.js handles this itself
  responseHeaders.delete('transfer-encoding');

  return new NextResponse(upstream.body, {
    status:  upstream.status,
    headers: responseHeaders,
  });
}

export const GET     = proxy;
export const POST    = proxy;
export const PATCH   = proxy;
export const PUT     = proxy;
export const DELETE  = proxy;
export const OPTIONS = proxy;
