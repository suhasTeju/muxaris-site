import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("seo routes", () => {
  it("lists the five public pages in the sitemap", () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://muxaris.com",
      "https://muxaris.com/pricing",
      "https://muxaris.com/faq",
      "https://muxaris.com/privacy",
      "https://muxaris.com/terms",
    ]);
  });

  it("disallows app and auth routes in robots", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        "/app",
        "/onboarding",
        "/auth",
        "/sign-in",
        "/sign-up",
        "/verify",
        "/forgot-password",
      ]),
    );
    expect(r.sitemap).toBe("https://muxaris.com/sitemap.xml");
  });
});
