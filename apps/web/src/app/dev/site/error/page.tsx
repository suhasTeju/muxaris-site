import { ErrorPreview } from "./ErrorPreview";

/** /dev/site/error: the public error boundary; `?signOut=1` is the app and onboarding variant. */
export default async function ErrorPagePreview({
  searchParams,
}: {
  searchParams: Promise<{ signOut?: string }>;
}) {
  const { signOut } = await searchParams;
  return <ErrorPreview signOut={signOut === "1"} />;
}
