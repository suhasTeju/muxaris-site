import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate for protected routes: redirect to /sign-in when no Cognito token cookie is present.
 * Amplify (ssr: true) stores tokens as `CognitoIdentityServiceProvider.<clientId>.<user>.*` cookies.
 * The authoritative session check runs in the (app) layout via runWithAmplifyServerContext.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("CognitoIdentityServiceProvider.") && c.name.endsWith(".accessToken"),
    );
  if (hasSession) {
    const headers = new Headers(request.headers);
    headers.set("x-next-path", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.next({ request: { headers } });
  }
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/sign-in";
  url.search = "";
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*", "/onboarding/:path*"] };
