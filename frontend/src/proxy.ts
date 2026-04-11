import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/pantry'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isStaticOrApi =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json' ||
    pathname.match(/\.(webp|png|jpg|jpeg|svg|ico|gif)$/) !== null;

  if (isStaticOrApi) return NextResponse.next();

  const hasSession = req.cookies.has('id_token');

  const isPublic =
    pathname === '/' ||
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (isPublic) return NextResponse.next();

  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
