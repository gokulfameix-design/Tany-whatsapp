"use client";
import Link from "next/link";
import type { WhatsAppSetup } from "@/lib/whatsapp/setup-types";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AutomationAccessCard({ businessId, allowed, account }: { businessId: string; allowed: boolean; account?: WhatsAppSetup | null }) {
  const [message, setMessage] = useState("");
  const connected = allowed && account?.status === "connected";
  return <Card className="max-w-xl gap-5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">WhatsApp Automation</h1>
      <Badge variant="secondary">{!allowed ? "Locked" : connected ? "Connected" : account ? "Setup pending" : "Not set up"}</Badge>
    </div>
    <p className="text-sm leading-6 text-muted-foreground">
      {allowed ? "Your subscription includes WhatsApp Automation." : "Available with Pro"}
    </p>
    {connected && <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Display name</dt><dd>{account.displayName}</dd></div><div><dt className="text-muted-foreground">Phone number</dt><dd>{account.displayPhone}</dd></div><div><dt className="text-muted-foreground">Product</dt><dd className="capitalize">{account.vertical}</dd></div><div><dt className="text-muted-foreground">Automation</dt><dd>ON</dd></div></dl>}
    {allowed ? <Button className="h-11 w-fit" asChild><Link href={`/business/${encodeURIComponent(businessId)}/whatsapp/setup`}>{connected ? "Manage WhatsApp" : account ? "Continue setup" : "Set up WhatsApp"}</Link></Button> : <Button className="h-11 w-fit" onClick={() => setMessage("Ask your Tany administrator to upgrade this business to Pro.")}>Upgrade to Pro</Button>}
    {message && <p role="status" className="text-sm leading-6">{message}</p>}
  </Card>;
}
