"use client";
import { useState, useTransition } from "react";
import { activateAccountForTesting, saveAccountMetadata } from "@/app/admin/account-actions";
import type { OperationAccount } from "@/lib/admin/operations-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

export function AccountMetadataEditor({ account, onUpdated }: { account: OperationAccount; onUpdated: (account: OperationAccount) => void }) {
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const prefix = `account-${account.accountId}`;
  return <Dialog>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={!account.accountId} title={!account.accountId ? "No WhatsApp account is configured yet." : undefined}>Edit</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Edit WhatsApp account</DialogTitle><DialogDescription>{account.business}. Saving metadata does not verify a live connection.</DialogDescription></DialogHeader>
      <form key={`${account.accountId}-${account.phoneNumberId}-${account.wabaId}-${account.phone}-${account.displayName}-${account.metadataStatus}`} className="space-y-4" onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const activate = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "activate";
        setMessage(""); setErrors({});
        startTransition(async () => {
          const action = activate ? activateAccountForTesting : saveAccountMetadata;
          const result = await action(account.businessId, account.accountId!, Object.fromEntries(form));
          setMessage(result.message);
          setErrors(result.errors ?? {});
          if (result.ok && result.account) onUpdated(result.account);
        });
      }}>
        {([
          ["displayName", "Display name", account.displayName, 120],
          ["displayPhone", "Phone number with country code", account.phone ?? "", 30],
          ["phoneNumberId", "Phone Number ID", account.phoneNumberId ?? "", 40],
          ["wabaId", "WABA ID", account.wabaId ?? "", 40],
        ] as const).map(([name, label, value, maxLength]) => <div key={name} className="space-y-1">
          <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
          <Input id={`${prefix}-${name}`} name={name} defaultValue={value} required maxLength={maxLength} disabled={pending} inputMode={name.endsWith("Id") ? "numeric" : name === "displayPhone" ? "tel" : "text"} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${prefix}-${name}-error` : undefined} />
          {errors[name] && <p id={`${prefix}-${name}-error`} className="text-sm text-destructive">{errors[name]}</p>}
        </div>)}
        <div className="space-y-1"><Label htmlFor={`${prefix}-status`}>Status</Label>
          <select id={`${prefix}-status`} name="status" disabled={pending} defaultValue={["configured", "connected", "disconnected", "error"].includes(account.metadataStatus ?? "") ? account.metadataStatus : "pending"} className="w-full rounded-md border bg-background p-2 text-sm">
            <option value="pending">Pending / not active</option><option value="configured">Configured (manual account)</option><option value="connected">Connected (use Activate for testing if unverified)</option><option value="disconnected">Disconnected</option><option value="error">Error</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <Button type="submit" value="activate" variant="outline" disabled={pending}>Activate for testing</Button>
        <p className="text-xs text-muted-foreground">Internal testing activates this account using the details above. It does not verify Meta connectivity or change client onboarding requirements.</p>
        {message && <p role="status" className="text-sm">{message}</p>}
      </form>
    </DialogContent>
  </Dialog>;
}
