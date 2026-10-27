"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WhatsAppSetup } from "@/lib/whatsapp/setup-types";

const steps = ["Setup Type", "WhatsApp Details", "Review", "Test", "Activate"];
export function WhatsAppSetupWizard({ businessId, initial }: { businessId: string; initial: WhatsAppSetup | null }) {
  const router = useRouter();
  const [account, setAccount] = useState(initial);
  const [step, setStep] = useState(initial?.setupStep ?? 1);
  const [setupType, setType] = useState<"existing" | "new">(initial?.setupType ?? "existing");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [sendTest, setSendTest] = useState(false);
  const [manual, setManual] = useState(false);
  async function run(input: object) {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/whatsapp/setup`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "UPGRADE_REQUIRED") setLocked(true);
        setError(result.message ?? "Could not complete this step.");
        return false;
      }
      setAccount(result.account); setStep(result.account.setupStep);
      router.refresh();
      return true;
    } catch { setError("Could not connect to Tany. Please try again."); return false; }
    finally { setPending(false); }
  }
  const connected = account?.status === "connected";
  return <div className="max-w-3xl space-y-6">
    <div><Link className="text-sm text-muted-foreground underline" href={`/business/${encodeURIComponent(businessId)}/whatsapp`}>WhatsApp Automation</Link>
      <h1 className="mt-3 text-2xl font-semibold">{connected ? "WhatsApp is connected" : "Set up WhatsApp"}</h1>
      {connected && <p className="mt-2 text-muted-foreground">Automation is ready</p>}
    </div>
    {!connected && <nav aria-label="Setup progress"><ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">{steps.map((label, i) => <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={`rounded-lg border px-3 py-3 text-sm ${step === i + 1 ? "border-primary bg-primary/5 font-semibold" : "text-muted-foreground"}`}>{i + 1}. {label}</li>)}</ol></nav>}
    <Card className="gap-5 p-6 sm:p-8" aria-busy={pending}>
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {locked ? <p className="font-medium">Available with Pro</p> : connected ? <>
        <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Display name</dt><dd>{account.displayName}</dd></div><div><dt className="text-sm text-muted-foreground">Phone number</dt><dd>{account.displayPhone}</dd></div><div><dt className="text-sm text-muted-foreground">Product</dt><dd className="capitalize">{account.vertical}</dd></div><div><dt className="text-sm text-muted-foreground">Automation</dt><dd>ON</dd></div></dl>
        {account.validationMode === "manual_test" && <p className="text-sm text-muted-foreground">Manual/test connection. Live Meta connectivity has not been verified.</p>}
        <Button variant="outline" disabled={pending} className="h-11 w-fit" onClick={() => { if (window.confirm("Disconnect WhatsApp and pause automation?")) void run({ action: "disconnect" }); }}>Disconnect WhatsApp</Button>
      </> : <>
        {step === 1 && <><h2 className="text-lg font-semibold">How do you want to set up WhatsApp?</h2><div className="grid gap-3 sm:grid-cols-2">{([['existing', 'Connect existing WhatsApp'], ['new', 'Set up a new WhatsApp']] as const).map(([value, label]) => <Button key={value} variant={setupType === value ? "default" : "outline"} className="h-auto min-h-14 whitespace-normal px-4 py-4" aria-pressed={setupType === value} onClick={() => setType(value)}>{label}</Button>)}</div><Button className="h-11 w-fit" onClick={() => setStep(2)}>Continue</Button></>}
        {step === 2 && <form className="space-y-5" onSubmit={e => {
          e.preventDefault(); const data = new FormData(e.currentTarget);
          void run({ action: "save", details: { setupType, displayName: data.get('displayName'), displayPhone: data.get('displayPhone'), businessName: data.get('businessName'), phoneNumberId: data.get('phoneNumberId'), wabaId: data.get('wabaId'), tokenSecretName: data.get('tokenSecretName') } });
        }}>
          <h2 className="text-lg font-semibold">WhatsApp details</h2>
          {setupType === "new" && <p className="text-sm leading-6 text-muted-foreground">New WhatsApp setup will be completed with Tany assistance.</p>}
          {[
            ["displayName", setupType === "new" ? "Desired display name" : "Display name", account?.displayName ?? "", 120],
            ["displayPhone", "Phone number (with country code)", account?.displayPhone ?? "", 30],
            ...(setupType === "new" ? [["businessName", "Business name", account?.businessName ?? "", 120]] : [
              ["phoneNumberId", "Phone Number ID", account?.phoneNumberId ?? "", 40], ["wabaId", "WABA ID", account?.wabaId ?? "", 40], ["tokenSecretName", "Token secret name", account?.tokenSecretName ?? "", 101],
            ]),
          ].map(([name, label, value, max]) => <div key={String(name)} className="space-y-2"><Label htmlFor={String(name)}>{label}</Label><Input className="h-11" id={String(name)} name={String(name)} defaultValue={String(value)} maxLength={Number(max)} type={name === 'displayPhone' ? 'tel' : 'text'} required disabled={pending} /></div>)}
          {setupType === "existing" && <p className="text-xs leading-5 text-muted-foreground">Use the name of a server-managed secret. Never paste the access token itself.</p>}
          <div className="flex gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setStep(1)}>Back</Button><Button className="h-11" disabled={pending}>{pending ? "Saving…" : "Review details"}</Button></div>
        </form>}
        {step === 3 && account && <><h2 className="text-lg font-semibold">Review details</h2><dl className="space-y-3">{[
          ["Setup type", account.setupType === 'new' ? 'New WhatsApp with Tany assistance' : 'Existing WhatsApp'], ["Display name", account.displayName], ["Phone number", account.displayPhone],
          ...(account.setupType === 'new' ? [["Business name", account.businessName]] : [["Phone Number ID", account.phoneNumberId], ["WABA ID", account.wabaId], ["Token secret name", account.tokenSecretName]]),
        ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
          {account.setupType === 'new' ? <div role="status" className="rounded-lg bg-muted p-4"><p className="font-medium">Request saved — pending Tany assistance</p><p className="mt-2 text-sm">Tany will help complete your WhatsApp Business setup.</p></div> : <Button className="h-11 w-fit" onClick={() => setStep(4)}>Continue to test</Button>}
          <Button variant="outline" className="w-fit" onClick={() => setStep(2)}>Edit details</Button>
        </>}
        {step === 4 && <><h2 className="text-lg font-semibold">Test connection</h2><p className="text-sm leading-6 text-muted-foreground">Check that this WhatsApp account belongs to your business. Sending a message is optional and requires an approved test recipient.</p>
          <Label className="flex items-center gap-3"><input type="checkbox" checked={manual} disabled={pending} onChange={e => { setManual(e.target.checked); setSendTest(false); }} />Use manual/test validation (requires Tany approval)</Label>
          {!manual && <><Label className="flex items-center gap-3"><input type="checkbox" checked={sendTest} disabled={pending} onChange={e => setSendTest(e.target.checked)} />Send a test message</Label>{sendTest && <div className="space-y-2"><Label htmlFor="recipient">Approved test recipient</Label><Input id="recipient" type="tel" value={recipient} disabled={pending} onChange={e => setRecipient(e.target.value)} /></div>}</>}
          {account?.testMessage && <p role="status" className="text-sm">{account.testMessage}</p>}
          <Button className="h-11 w-fit" disabled={pending || account?.status === 'testing'} onClick={() => void run({ action: 'test', mode: manual ? 'manual_test' : 'live', sendTest, recipient })}>{pending ? "Testing…" : account?.status === 'testing' ? "Test in progress" : "Test connection"}</Button>
          {account?.status === 'testing' && <Button variant="outline" className="h-11 w-fit" disabled={pending} onClick={() => void run({ action: 'disconnect' })}>Stop test and edit details</Button>}
          <Button variant="outline" className="w-fit" disabled={pending} onClick={() => setStep(2)}>Edit details</Button>
        </>}
        {step === 5 && <><h2 className="text-lg font-semibold">Activate WhatsApp</h2><p role="status" className="text-sm leading-6">{account?.testMessage}</p><p className="text-sm text-muted-foreground">Activate within 15 minutes of a successful test.</p><Button className="h-11 w-fit" disabled={pending || !account?.testPassed} onClick={() => void run({ action: 'activate' })}>{pending ? 'Activating…' : 'Activate automation'}</Button><Button variant="outline" className="w-fit" disabled={pending} onClick={() => setStep(4)}>Run test again</Button></>}
      </>}
    </Card>
  </div>;
}
