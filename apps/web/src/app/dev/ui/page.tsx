import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { UiGallery } from "@/components/dev/UiGallery";

/** /dev/ui?m=dialog|drawer&t=1: every UI primitive inside the app shell. */
export default async function DevUi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const m = q["m"];
  return (
    <DevAppFrame>
      <UiGallery modal={m === "dialog" || m === "drawer" ? m : undefined} toasts={q["t"] === "1"} />
    </DevAppFrame>
  );
}
