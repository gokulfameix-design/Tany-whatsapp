"use client";

import { useState } from "react";
import { Check, CircleAlert, LoaderCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ClientWhatsAppConnection } from "@/lib/whatsapp/client-connection";

const steps = [
  "Start setup",
  "Add WhatsApp details",
  "Review connection",
  "Test connection",
  "Finish setup",
];

const healthLabel: Record<ClientWhatsAppConnection["health"], string> = {
  not_available: "Not available yet",
  configured: "Configured",
  verified: "Last check verified",
  needs_attention: "Needs attention",
};

function SetupProgress({ connection }: { connection: ClientWhatsAppConnection }) {
  const complete = connection.status === "connected";
  const activeIndex = connection.status === "testing" ? 3 : 0;
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="WhatsApp setup progress">
      {steps.map((step, index) => {
        const done = complete;
        const current = !done && index === activeIndex;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className={`flex min-h-16 items-center gap-3 rounded-lg border p-3 text-sm ${
              done ? "border-success/30 bg-success/5" : current ? "border-primary bg-primary/5" : "text-muted-foreground"
            }`}
          >
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? "bg-success text-white" : current ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0"><span className="block">{step}</span><span className="mt-0.5 block text-xs text-muted-foreground">{done ? "Complete" : current ? "In progress" : "Pending"}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

export function WhatsAppConnection({
  initialConnection,
}: {
  initialConnection: ClientWhatsAppConnection;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [screen, setScreen] = useState<"summary" | "onboarding" | "manage">(
    initialConnection.status === "not_connected" || initialConnection.status === "disconnected" ? "summary" : "summary",
  );
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  const connected = connection.status === "connected";
  const inProgress = ["pending", "testing", "error"].includes(connection.status);
  const openOnboarding = () => {
    setNotice("");
    setScreen("onboarding");
  };
  const disconnect = async () => {
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/dashboard/whatsapp-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not disconnect WhatsApp.");
      setConnection(result.connection);
      setNotice("WhatsApp has been disconnected. You can reconnect whenever you are ready.");
      setScreen("summary");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not disconnect WhatsApp.");
    } finally {
      setPending(false);
      setDisconnectOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-primary">WhatsApp Setup</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect your business WhatsApp</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Manage the WhatsApp connection that powers your inbox, automations and campaigns.
        </p>
      </div>
      {notice && <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">{notice}</p>}

      {screen === "onboarding" ? (
        <div className="space-y-6">
          <SetupProgress connection={connection} />
          <Card className="max-w-3xl">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div><h2 className="text-lg font-semibold">Set up your WhatsApp connection</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">WhatsApp login and sign-in are not available in Tany. A Tany team member can help connect your business number without exposing your credentials here.</p></div>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6">Use the existing WhatsApp setup process to provide connection details to your Tany representative. Passwords and verification codes are never entered in this dashboard.</div>
              <div className="flex flex-wrap gap-3"><Button variant="outline" className="min-h-11" onClick={() => setScreen("summary")}>Back to connection</Button></div>
            </CardContent>
          </Card>
        </div>
      ) : connected ? (
        <div className="space-y-6">
          <SetupProgress connection={connection} />
          <Card className="max-w-3xl"><CardContent className="space-y-6 p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">WhatsApp is connected</h2><p className="mt-2 text-sm text-muted-foreground">Your WhatsApp dashboard is ready to use.</p></div><Badge className="bg-success/10 text-success">Connected</Badge></div><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Display name</dt><dd className="mt-1 font-medium">{connection.displayName}</dd></div><div><dt className="text-sm text-muted-foreground">WhatsApp phone number</dt><dd className="mt-1 font-medium">{connection.displayPhone}</dd></div><div><dt className="text-sm text-muted-foreground">Catalog</dt><dd className="mt-1">{connection.catalogConnected ? "Connected" : "Not connected"}</dd></div><div><dt className="text-sm text-muted-foreground">Connection health</dt><dd className="mt-1">{healthLabel[connection.health]}</dd></div></dl><div className="flex flex-wrap gap-3"><Button className="min-h-11" onClick={() => setScreen("manage")}>Manage connection</Button><Button variant="outline" className="min-h-11" onClick={openOnboarding}>Reconnect</Button><Button variant="outline" className="min-h-11 text-destructive hover:text-destructive" onClick={() => setDisconnectOpen(true)}>Disconnect</Button></div></CardContent></Card>
        </div>
      ) : inProgress ? (
        <div className="space-y-6"><SetupProgress connection={connection} /><Card className="max-w-3xl"><CardContent className="space-y-5 p-6 sm:p-8"><div className="flex gap-3"><CircleAlert className="mt-0.5 size-5 text-primary" aria-hidden="true" /><div><h2 className="text-xl font-semibold">WhatsApp setup in progress</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Connection setup is managed through the existing Tany process.</p></div></div>{connection.status === "error" && connection.setupMessage && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{connection.setupMessage}</p>}<Button className="min-h-11" onClick={openOnboarding}>View setup details</Button></CardContent></Card></div>
      ) : (
        <Card className="max-w-3xl"><CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><PlugZap className="size-5" aria-hidden="true" /></div><h2 className="mt-4 text-xl font-semibold">Connect WhatsApp</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Connect your business WhatsApp number to start using inbox, automations and campaigns.</p></div><Button className="min-h-11 shrink-0" onClick={openOnboarding}>Connect WhatsApp</Button></CardContent></Card>
      )}

      {screen === "manage" && connected && <Card className="max-w-3xl"><CardContent className="space-y-4 p-6"><h2 className="text-lg font-semibold">Manage connection</h2><p className="text-sm leading-6 text-muted-foreground">Connection changes use Tany’s secure setup process. Technical account details and credentials are never shown here.</p><Button variant="outline" className="min-h-11" onClick={openOnboarding}>Reconnect WhatsApp</Button></CardContent></Card>}
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle><AlertDialogDescription>This pauses WhatsApp automation for this business. You can reconnect later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Keep connected</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); void disconnect(); }}>{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
