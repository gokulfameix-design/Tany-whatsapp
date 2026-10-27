import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { resolveDashboardSession } from "@/lib/admin/dashboard-access";
import { EntitlementError } from "@/lib/subscriptions/entitlements";
import { getClientWhatsAppConnection } from "@/lib/whatsapp/client-connection";
import type { ClientWhatsAppConnection } from "@/lib/whatsapp/client-connection";
import { WhatsAppConnection } from "../_components/whatsapp-connection";
import "@/app/admin/admin.css";

async function ClientSetup() {
  await connection();
  const store = await cookies();
  const session = await resolveDashboardSession(
    process.env.MESSAGING_SERVICE_SECRET ?? "",
    store.get("__Host-tany-dashboard")?.value ?? "",
  );
  if (session?.role !== "business") redirect("/dashboard");
  let clientConnection: ClientWhatsAppConnection | null = null;
  let upgradeRequired = false;
  try {
    clientConnection = await getClientWhatsAppConnection(session.businessId);
  } catch (error) {
    if (!(error instanceof EntitlementError)) throw error;
    upgradeRequired = true;
  }
  if (upgradeRequired)
    return <main className="tany-admin min-h-svh p-4 sm:p-6"><div className="mx-auto max-w-3xl rounded-xl border p-6 sm:p-8"><p className="text-sm font-medium text-primary">WhatsApp Setup</p><h1 className="mt-2 text-2xl font-semibold">WhatsApp Automation — Available with Pro</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Upgrade to Pro to connect and manage your business WhatsApp number.</p><a className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href="/dashboard">Upgrade</a></div></main>;
  return <main className="tany-admin min-h-svh p-4 sm:p-6"><div className="mx-auto max-w-6xl space-y-6"><nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="WhatsApp dashboard navigation"><Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted" href="/dashboard/messaging/setup">WhatsApp Dashboard</Link><Link className="rounded-md bg-muted px-3 py-2 font-medium" aria-current="page" href="/dashboard/messaging/setup">WhatsApp Setup</Link></nav><WhatsAppConnection initialConnection={clientConnection!} /></div></main>;
}

export default function Page() {
  return <Suspense fallback={<main className="tany-admin min-h-svh p-6"><p className="text-sm text-muted-foreground">Opening WhatsApp setup…</p></main>}><ClientSetup /></Suspense>;
}
