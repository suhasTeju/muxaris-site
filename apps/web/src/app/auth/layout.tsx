import { AmplifyProvider } from "@/components/auth/amplify-provider";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AmplifyProvider>{children}</AmplifyProvider>;
}
