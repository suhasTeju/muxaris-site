import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/pricing", "/faq", "/privacy", "/terms"];
  return paths.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: new Date(),
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.6,
  }));
}
