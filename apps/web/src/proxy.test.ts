import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const req = (path: string, cookie?: string) =>
  new NextRequest(`https://muxaris.test${path}`, cookie ? { headers: { cookie } } : undefined);

const session = "CognitoIdentityServiceProvider.abc.user.accessToken=jwt";

describe("proxy", () => {
  it("redirects to /sign-in with the original path when there is no Cognito token cookie", () => {
    const res = proxy(req("/app/calls?x=1"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/sign-in");
    expect(loc.searchParams.get("next")).toBe("/app/calls?x=1");
  });
  it("ignores look-alike cookies", () => {
    const res = proxy(
      req("/app", "CognitoIdentityServiceProvider.abc.user.idToken=x; accessToken=y"),
    );
    expect(res.status).toBe(307);
  });
  it("passes through with the path recorded when an access-token cookie exists", () => {
    const res = proxy(req("/onboarding?s=1", session));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-next-path")).toBe("/onboarding?s=1");
  });
  it("matches only /app and /onboarding trees", () => {
    const [m] = config.matcher;
    const re = new RegExp("^" + m!.replace(/\/:path\*/, "(?:/.*)?") + "$");
    expect(re.test("/app")).toBe(true);
    expect(re.test("/app/calls")).toBe(true);
    expect(m).toBe("/app/:path*");
    expect(config.matcher).toContain("/onboarding/:path*");
    for (const p of ["/", "/pricing", "/sign-in"]) {
      expect(
        config.matcher.some((x) =>
          new RegExp("^" + x.replace(/\/:path\*/, "(?:/.*)?") + "$").test(p),
        ),
      ).toBe(false);
    }
  });
});
