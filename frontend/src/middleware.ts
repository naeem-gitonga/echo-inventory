import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/pantry'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and anything under them
  const isPublic =
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon');

  if (isPublic) return NextResponse.next();

  // Check for Amplify session cookie (set by @aws-amplify/auth in the browser)
  // The cookie name follows the pattern: CognitoIdentityServiceProvider.{clientId}.LastAuthUser
  const hasSession = Array.from(req.cookies.getAll()).some(
    c => c.name.includes('CognitoIdentityServiceProvider') || c.name.includes('amplify')
  );

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
