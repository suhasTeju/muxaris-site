import { notFound } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toaster";

export const metadata = { title: "Dev preview", robots: { index: false, follow: false } };
// Never prerendered at build time, so no fixture page is written into the production output.
export const dynamic = "force-dynamic";

/**
 * Development-only preview routes: screens rendered with fixture data, no sign-in, no API.
 * Outside `next dev` the proxy answers every /dev path with a 404 before anything renders; this
 * guard is the backstop if the proxy matcher ever changes. (A layout guard alone is not enough:
 * Next renders the page segment in parallel and its output would still ship in the 404 payload.)
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ToastProvider>{children}</ToastProvider>;
}
