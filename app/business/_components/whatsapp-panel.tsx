"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  FlaskConical,
  MessageCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, Feedback } from "@/app/admin/components/shared";
import {
  previewWhatsAppTest,
  type WhatsAppTestState,
} from "@/app/business/[businessId]/whatsapp/actions";
import type {
  WhatsAppActivity,
  WhatsAppOverview,
} from "@/lib/admin/whatsapp-service";

const initialTest: WhatsAppTestState = { ok: false, message: "" };
function when(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not recorded";
}
function status(message: WhatsAppActivity | null) {
  if (!message) return "Not recorded";
  if (message.status === "processed")
    return message.direction === "outgoing" ? "Send recorded" : "Processed";
  return message.status === "received"
    ? "Received / processing"
    : message.status === "failed"
      ? "Processing failed"
      : "Unknown";
}
function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
      {hint && (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
function MessageActivity({ messages }: { messages: WhatsAppActivity[] }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Recent message activity</h2>
        <span className="text-xs text-muted-foreground">Latest 25 records</span>
      </div>
      {messages.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Direction</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Processing result</TableHead>
              <TableHead>Recorded at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map((message) => (
              <TableRow key={message.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2 text-xs">
                    {message.direction === "incoming" ? (
                      <ArrowDownLeft className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    )}
                    {message.direction}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{message.type}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      message.status === "failed" ? "destructive" : "secondary"
                    }
                    className="rounded-md font-normal"
                  >
                    {status(message)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {when(message.recordedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <MessageCircle className="mb-3 size-6 text-muted-foreground" />
          <h3 className="text-sm font-medium">No message activity yet</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Incoming and outgoing records for this business will appear here.
            Chat history remains in Conversations.
          </p>
        </div>
      )}
    </Card>
  );
}
function TestMessage({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    previewWhatsAppTest.bind(null, businessId),
    initialTest,
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FlaskConical />
          Test message
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!pending} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test message</DialogTitle>
          <DialogDescription>
            Validate a message payload locally. Live sending is not enabled;
            nothing will be sent or saved.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <Feedback state={state} />
          <Field
            name="recipient"
            label="Recipient phone"
            error={state.errors?.recipient}
            hint="Include the country code, for example 919876543210."
          >
            <Input
              id="recipient"
              name="recipient"
              type="tel"
              autoComplete="off"
              required
              maxLength={16}
              aria-invalid={!!state.errors?.recipient}
              aria-describedby={
                state.errors?.recipient ? "recipient-error" : "recipient-hint"
              }
            />
          </Field>
          <Field name="message" label="Message" error={state.errors?.message}>
            <Textarea
              id="message"
              name="message"
              required
              maxLength={1000}
              rows={3}
              defaultValue="Hello from Tany. This is a local test."
              aria-invalid={!!state.errors?.message}
              aria-describedby={
                state.errors?.message ? "message-error" : undefined
              }
            />
          </Field>
          {state.preview && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <p className="font-medium">Local preview</p>
              <p className="mt-2">To: {state.preview.to}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {state.preview.text}
              </p>
              <p className="mt-2 text-muted-foreground">
                {state.preview.phoneNumberId
                  ? "Phone number ID configured. Live connection is not verified."
                  : "No valid phone number ID configured. Connection setup is pending."}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
            <Button disabled={pending}>
              {pending ? "Validating..." : "Validate test message"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function WhatsAppPanel({ data }: { data: WhatsAppOverview }) {
  const router = useRouter();
  const settingsHref = `/business/${encodeURIComponent(data.businessId)}/settings`;
  const connection = !data.businessActive
    ? "Business inactive"
    : !data.phoneNumberId
      ? "Not connected"
      : "Pending verification";
  const stats = [
    {
      label: "Incoming messages",
      value: data.counts.incoming,
      icon: ArrowDownLeft,
    },
    {
      label: "Outgoing messages",
      value: data.counts.outgoing,
      icon: ArrowUpRight,
    },
    { label: "Processing failures", value: data.counts.failed, icon: Activity },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
            <Badge variant="secondary" className="rounded-md font-normal">
              {connection}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connection and messaging health for {data.businessName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh WhatsApp status"
            onClick={() => router.refresh()}
          >
            <RefreshCw />
          </Button>
          <TestMessage businessId={data.businessId} />
          <Button variant="outline" asChild>
            <Link href={settingsHref}>
              <Settings />
              Settings
            </Link>
          </Button>
        </div>
      </div>
      <Tabs defaultValue="overview" className="gap-4">
        <div className="overflow-x-auto">
          <TabsList aria-label="WhatsApp sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="messages">Message Status</TabsTrigger>
            <TabsTrigger value="webhook">Webhook Health</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="gap-0 p-4 shadow-none">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
              </Card>
            ))}
          </div>
          <Card className="gap-4 p-4 sm:p-6 shadow-none">
            <h2 className="text-sm font-semibold">Connection details</h2>
            <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Detail
                label="Connection status"
                value={connection}
                hint="Live Meta connection checks are pending setup."
              />
              <Detail
                label="WhatsApp Phone Number ID"
                value={data.phoneNumberId ?? "Not configured"}
              />
              <Detail label="WABA ID" value={data.wabaId ?? "Pending setup"} />
              <Detail
                label="Connected number"
                value={data.connectedNumber ?? "Not available"}
                hint="Profile value only; live registration is not verified."
              />
              <Detail
                label="Webhook status"
                value={
                  data.lastWebhookAt
                    ? "Incoming activity recorded"
                    : "Pending setup / no activity"
                }
              />
              <Detail
                label="Last webhook received"
                value={when(data.lastWebhookAt)}
                hint="Based on the latest stored incoming message."
              />
              <Detail
                label="Last outgoing message"
                value={status(data.lastOutgoing)}
                hint={
                  data.lastOutgoing
                    ? when(data.lastOutgoing.recordedAt)
                    : "No outgoing message has been recorded."
                }
              />
              <Detail
                label="Token / connection health"
                value="Not checked"
                hint="Live health checks are not enabled."
              />
            </dl>
          </Card>
          <MessageActivity messages={data.activity} />
        </TabsContent>
        <TabsContent value="templates">
          <Card className="items-center gap-3 px-4 py-12 text-center shadow-none">
            <FileText className="size-7 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Templates pending setup</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Template synchronization and approval status are not connected
              yet. No templates have been fetched from Meta.
            </p>
            <Badge variant="secondary" className="rounded-md font-normal">
              Not synchronized
            </Badge>
          </Card>
        </TabsContent>
        <TabsContent value="messages" className="space-y-4">
          <Card className="gap-2 p-4 shadow-none">
            <h2 className="text-sm font-semibold">
              Recorded processing status
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              A recorded send is not a delivery or read confirmation.
              Delivery/read receipts are not tracked by this dashboard. Failures
              reflect stored processing results, which can include a reply-send
              failure.
            </p>
          </Card>
          <MessageActivity messages={data.activity} />
        </TabsContent>
        <TabsContent value="webhook" className="space-y-4">
          <Card className="gap-4 p-4 sm:p-6 shadow-none">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Webhook health</h2>
            </div>
            <dl className="grid gap-6 sm:grid-cols-2">
              <Detail label="Webhook endpoint" value="/api/whatsapp/webhook" />
              <Detail
                label="Verification health"
                value="Not checked"
                hint="Webhook verification and subscription state require a live check."
              />
              <Detail
                label="Last incoming webhook record"
                value={when(data.lastWebhookAt)}
              />
              <Detail
                label="Incoming records"
                value={String(data.counts.incoming)}
              />
              <Detail
                label="Received / processing records"
                value={String(data.counts.processing)}
              />
              <Detail
                label="Processing failures"
                value={String(data.counts.failed)}
              />
            </dl>
            <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
              These observations come from this business&apos;s stored messages.
              An empty log does not prove a webhook failure. Status-only
              callbacks and provider uptime are not measured here.
            </p>
          </Card>
          <Card className="flex-row items-start gap-3 p-4 shadow-none">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              The existing webhook route is unchanged. This page reads records
              and does not modify Meta subscriptions or credentials.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
