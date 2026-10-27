import { demoAuthEnabled } from "@/lib/messaging/auth-mode";
import { DemoWhatsAppConnect } from "./demo-whatsapp-connect";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  inspectLinkSession,
  LinkingError,
} from "@/lib/messaging/services/identity-service";
import { WhatsAppConnect } from "./whatsapp-connect";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Connect WhatsApp · Tany",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  let error = "";
  let phone = "";
  try {
    if (typeof token !== "string") throw new LinkingError("invalid");
    const session = await inspectLinkSession(token);
    if (demoAuthEnabled()) phone = `+${session.whatsappPhone}`;
  } catch (cause) {
    error =
      cause instanceof LinkingError
        ? cause.code === "used"
          ? "This link has already been used. Return to WhatsApp."
          : "This link is invalid or expired. Send a WhatsApp message to get a new link."
        : "We could not check your link. Please try again shortly.";
  }
  const Connect = demoAuthEnabled() ? DemoWhatsAppConnect : WhatsAppConnect;
  return (
    <Connect
      phone={phone}
      token={!error && typeof token === "string" ? token : ""}
      initialError={error}
    />
  );
}
export default function Page(props: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md p-6">
          <Skeleton className="h-80 w-full" />
        </main>
      }
    >
      <LinkPage {...props} />
    </Suspense>
  );
}
