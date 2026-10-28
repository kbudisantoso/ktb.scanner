import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_LOCALE_HEADER, resolveDemoLocale } from './app/locale';

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    DEMO_LOCALE_HEADER,
    resolveDemoLocale(
      request.nextUrl.searchParams.get('lang'),
      request.headers.get('accept-language'),
    ),
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: '/' };
