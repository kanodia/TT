import { NextResponse, type NextRequest } from 'next/server';

/**
 * Staging password gate. When STAGING_PASSWORD is set, every page and asset asks for it
 * (HTTP basic auth, any username). Unset in production.
 */
export function proxy(request: NextRequest) {
  const password = process.env.STAGING_PASSWORD;
  if (!password) return NextResponse.next();
  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    if (decoded.slice(decoded.indexOf(':') + 1) === password) return NextResponse.next();
  }
  return new NextResponse('Staging — password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="TwiggyTomato staging", charset="UTF-8"' },
  });
}

export const config = {
  // Every page, API route and static asset (so the JS bundle, which holds the dev sign-in key, is gated too).
  matcher: '/((?!favicon.ico).*)',
};
