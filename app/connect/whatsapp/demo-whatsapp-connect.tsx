"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export function DemoWhatsAppConnect({ token, phone, initialError }: {
  token: string;
  phone: string;
  initialError: string;
}) {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [notified, setNotified] = useState(false);
  const [error, setError] = useState(initialError);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/connect/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "confirm" }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not connect WhatsApp. Please try again.");
        return;
      }
      setSuccess(true);
      setNotified(result.notificationSent === true);
      window.history.replaceState(null, "", "/connect/whatsapp");
    } catch {
      setError("Could not check the connection. Refresh this page before trying again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md gap-6 p-6 sm:p-8">
        <BrandLogo variant="wordmark" />
        <div aria-live="polite">
          {success && <CheckCircle2 aria-hidden="true" className="mb-3 size-8 text-primary" />}
          <h1 className="text-2xl font-semibold tracking-tight">
            {success ? "WhatsApp connected successfully" : "Connect your WhatsApp to Tany"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {success
              ? notified
                ? "Return to WhatsApp to choose from your business menu."
                : "Your WhatsApp is connected. Send Hi in WhatsApp to open your business menu."
              : "Continue with a demo account to explore Tany."}
          </p>
        </div>
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p>}
        {!success && token && phone && (
          <>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{phone}</p>
            </div>
            <Button className="h-12 w-full" disabled={pending || !!error} onClick={confirm}>
              {pending ? "Connecting…" : "Continue as Demo User"}
            </Button>
          </>
        )}
        <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
          Demo mode. This link expires after 15 minutes and can be used once. Never share your link.
        </p>
      </Card>
    </main>
  );
}
