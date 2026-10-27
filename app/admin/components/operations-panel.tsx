"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { AccountMetadataEditor } from "@/app/admin/components/account-metadata-editor";
import { useRouter } from "next/navigation";
import { operationsMetrics } from "@/lib/admin/operations-metrics";
import {
  ArrowUpRight,
  Bot,
  CheckCheck,
  CircleHelp,
  Inbox,
  MapPin,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  operationLabels,
  type OperationsData,
  type OperationSection,
  type OperationConversation,
  type OperationAccount,
} from "@/lib/admin/operations-types";
import { updateOperations } from "../operations-actions";
import { previewWhatsAppTest } from "@/app/business/[businessId]/whatsapp/actions";

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not recorded";
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      variant={
        value === "failed" || value === "rejected" ? "destructive" : "secondary"
      }
      className="whitespace-nowrap font-normal"
    >
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
function Empty({
  text = "No records yet. WhatsApp activity will appear here when available.",
}: {
  text?: string;
}) {
  return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      <Inbox className="mx-auto mb-3 size-6" />
      {text}
    </div>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}
function GridTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground"
    >
      <CircleHelp className="mt-0.5 size-4 shrink-0" />
      {children}
    </div>
  );
}

export function OperationsPanel({
  data: initialData,
  section,
}: {
  data: OperationsData;
  section: OperationSection;
}) {
  const [data, setData] = useState(initialData);
  const [snapshot, setSnapshot] = useState(initialData);
  if (snapshot !== initialData) { setSnapshot(initialData); setData(initialData); }
  const client = data.audience === "client";
  const router = useRouter();
  const metrics = operationsMetrics(data);
  const [templateId, setTemplateId] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [parameters, setParameters] = useState<string[]>([]);
  const requestId = useRef("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState("all");
  const [selected, setSelected] = useState<OperationConversation | null>(
    data.conversations[0] ?? null,
  );
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [settings, setSettings] = useState(data.settings);
  const [rules, setRules] = useState(data.automations);
  const [pending, startTransition] = useTransition();
  const root = data.businessId
    ? `/business/${encodeURIComponent(data.businessId)}`
    : "/admin";
  useEffect(() => {
    if (!data.businessId) return;
    let cancelled = false;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/${client ? "dashboard" : "admin"}/operations?section=${section}&businessId=${encodeURIComponent(data.businessId!)}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (cancelled) return;
        if (response.ok) {
          setData(result.data);
          setSelected(previous => result.data.conversations.find((c: OperationConversation) => c.id === previous?.id) ?? result.data.conversations[0] ?? null);
        } else if (["UPGRADE_REQUIRED", "SETUP_REQUIRED", "UNAUTHORIZED"].includes(result.code)) router.refresh();
      } catch { /* A later poll can recover; existing messages remain readable. */ }
    };
    const timer = setInterval(() => void refresh(), 8000);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [client, data.businessId, section, router]);
  useEffect(() => {
    if (!selected || section !== "inbox" || !selected.unread) return;
    void fetch(`/api/${client ? "dashboard" : "admin"}/operations?businessId=${encodeURIComponent(selected.businessId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", input: { id: selected.id } }),
    }).catch(() => {});
  }, [selected?.id, selected?.unread, selected?.businessId, selected, section, client]);
  const sendReply = () => startTransition(async () => {
    if (!selected) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const response = await fetch(`/api/${client ? "dashboard" : "admin"}/operations?businessId=${encodeURIComponent(selected.businessId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", input: { id: selected.id, requestId: requestId.current, text: draft, templateId, parameters } }),
      });
      const result = await response.json();
      if (!response.ok) { setFeedback(result.message ?? "Could not send this message."); return; }
      if (result.result?.duplicate && !["sent", "delivered", "read"].includes(result.result.status)) { setFeedback("This send is already recorded. Check message status before sending again."); return; }
      setFeedback("Message accepted by WhatsApp."); setDraft(""); setTemplateId(""); setParameters([]); requestId.current = "";
      if (client) {
        const updated = await fetch(`/api/${client ? "dashboard" : "admin"}/operations?businessId=${encodeURIComponent(selected.businessId)}&section=inbox`, { cache: "no-store" });
        if (updated.ok) setData((await updated.json()).data);
      } else router.refresh();
    } catch { setFeedback("Could not confirm this send. Check message status before retrying."); }
  });
  const match = (values: unknown[]) =>
    values.join(" ").toLowerCase().includes(search.toLowerCase());
  const scoped = (businessId: string) =>
    businessFilter === "all" || businessFilter === businessId;
  const filteredMessages = data.messages.filter(
    (m) =>
      scoped(m.businessId) &&
      (filter === "all" || m.status === filter) &&
      match([m.messageId, m.phone, m.business, m.type, m.status]),
  );
  const conversations = data.conversations.filter(
    (c) =>
      scoped(c.businessId) &&
      (filter === "all" ||
        (filter === "human"
          ? c.status === "handed_off"
          : c.status !== "handed_off")) &&
      match([c.name, c.phone, c.business, c.lastMessage]),
  );
  const save = (
    businessId: string,
    kind: "configuration" | "campaign" | "handoff",
    input: unknown,
  ) =>
    startTransition(async () => {
      const result = await updateOperations(businessId, kind, input);
      setFeedback(result.message);
      if (
        result.ok &&
        kind === "handoff" &&
        selected &&
        input &&
        typeof input === "object" &&
        "human" in input
      )
        setSelected({
          ...selected,
          status: input.human ? "handed_off" : "active",
        });
    });
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-48 flex-1">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          aria-label={`Search ${operationLabels[section]}`}
          placeholder={`Search ${operationLabels[section].toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-9"
        />
      </div>
      {!data.businessId && (
        <select
          aria-label="Filter by business"
          className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
          value={businessFilter}
          onChange={(e) => {
            setBusinessFilter(e.target.value);
            setSelected(null);
          }}
        >
          {[
            <option key="all" value="all">
              All businesses
            </option>,
            ...data.accounts.map((a) => (
              <option key={a.businessId} value={a.businessId}>
                {a.business}
              </option>
            )),
          ]}
        </select>
      )}
    </div>
  );
  const statusTabs = (values: string[]) => (
    <Tabs value={filter} onValueChange={setFilter}>
      <TabsList className="max-w-full overflow-x-auto">
        {["all", ...values].map((v) => (
          <TabsTrigger key={v} value={v} className="capitalize">
            {v}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
  const messageTable = (messages = filteredMessages) =>
    messages.length ? (
      <GridTable
        headers={[
          "Message ID",
          "Recipient / sender",
          "Business",
          "Type",
          "Status",
          "Timestamp (IST)",
          "Failure reason",
        ]}
        rows={messages
          .slice()
          .reverse()
          .map((m) => [
            <span
              key="id"
              className="block max-w-44 truncate font-mono text-xs"
              title={m.messageId}
            >
              {m.messageId}
            </span>,
            m.phone,
            m.business,
            m.type,
            <Status key="status" value={m.status} />,
            date(m.at),
            m.failure || "—",
          ])}
      />
    ) : (
      <Empty />
    );
  const health = (
    <GridTable
      headers={["Signal", "Value"]}
      rows={[
        ["Webhook verification", data.health.verification],
        ["Last webhook received", date(data.health.lastReceived)],
        ["Incoming message events", data.health.incoming],
        ["Last error", data.health.lastError],
        [
          "Duplicate events blocked",
          data.health.duplicates ?? "Not instrumented",
        ],
        ["Failed processing events", data.health.failed],
        [
          "Response latency",
          data.health.latency === null
            ? "Not instrumented"
            : `${data.health.latency} ms`,
        ],
      ]}
    />
  );
  const recent = (items: OperationConversation[]) =>
    items.length ? (
      <ul className="divide-y">
        {items.slice(0, 6).map((c) => (
          <li key={`${c.businessId}/${c.id}`}>
            <Link
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
              href={`${root}/inbox`}
            >
              <BrandLogo vertical={c.vertical} decorative />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.lastMessage || c.phone}
                </div>
              </div>
              <Status value={c.status} />
              <ArrowUpRight className="size-3" />
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <Empty />
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            WhatsApp operations
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {operationLabels[section]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.businessName} <span aria-hidden="true">·</span>{" "}
            {section === "overview"
              ? "Messaging activity at a glance"
              : "Manage WhatsApp messaging"}
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <ShieldCheck className="size-3" />
          {data.businessId ? "Business scope" : "Super Admin"}
        </Badge>
      </div>
      {feedback && (
        <div role="status" className="rounded-md border bg-muted p-3 text-sm">
          {feedback}
        </div>
      )}
      {section === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {(client ? [["Messages today (IST)", metrics.today], ["Incoming", metrics.incoming], ["Outgoing", metrics.outgoing], ["Delivered", metrics.delivered], ["Read", metrics.read], ["Failed", metrics.failed], ["Active conversations", metrics.active], ["Human handoffs", metrics.handoffs]] : [
              [
                "Connected WhatsApp accounts",
                data.accounts.filter((a) => a.status === "Connected").length,
              ],
              [
                "Messages today (IST)",
                data.messages.filter(
                  (m) =>
                    m.at &&
                    new Date(m.at).toLocaleDateString("en-CA", {
                      timeZone: "Asia/Kolkata",
                    }) ===
                      new Date().toLocaleDateString("en-CA", {
                        timeZone: "Asia/Kolkata",
                      }),
                ).length,
              ],
              [
                "Incoming messages",
                data.messages.filter((m) => m.direction === "incoming").length,
              ],
              [
                "Outgoing messages",
                data.messages.filter((m) => m.direction === "outgoing").length,
              ],
              [
                "Delivered",
                data.messages.filter((m) =>
                  ["delivered", "read"].includes(m.status),
                ).length,
              ],
              ["Read", data.messages.filter((m) => m.status === "read").length],
              [
                "Failed",
                data.messages.filter((m) => m.status === "failed").length,
              ],
              [
                "Active conversations",
                data.conversations.filter(
                  (c) =>
                    !["completed", "cancelled", "unknown"].includes(c.status),
                ).length,
              ],
              [
                "Human handoffs",
                data.conversations.filter((c) => c.status === "handed_off")
                  .length,
              ],
              ["Template count", data.templates.length],
            ]).map(([label, value]) => (
              <Card key={label} className="gap-2 p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </Card>
            ))}
          </div>
          <Notice>
            Delivery and read counts show recorded WhatsApp receipts. An accepted message is not yet a delivery confirmation.
          </Notice>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Recent conversations">
              {recent(data.conversations)}
            </Panel>
            <Panel title="Message delivery funnel">
              <div className="space-y-4 p-4">
                {["sent", "delivered", "read"].map((status, i) => {
                  const total = data.messages.filter(
                    (m) => m.direction === "outgoing",
                  ).length;
                  const n = data.messages.filter((m) =>
                    ["sent", "delivered", "read"].slice(i).includes(m.status),
                  ).length;
                  return (
                    <div key={status}>
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="capitalize">{status}</span>
                        <span>
                          {n} / {total}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div
                          className="h-2 rounded bg-primary"
                          style={{ width: `${total ? (n / total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Cumulative recorded receipts. Unknown delivery states are
                  excluded.
                </p>
              </div>
            </Panel>
            <Panel title="Recent failures">
              {messageTable(
                data.messages.filter((m) => m.status === "failed").slice(-5),
              )}
            </Panel>
            {!client && <Panel title="Webhook health">{health}</Panel>}
          </div>
        </>
      )}
      {section === "inbox" && (
        <>
          {toolbar}
          <div className="grid min-h-[620px] overflow-hidden rounded-lg border lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="max-h-[680px] overflow-y-auto border-b lg:border-r lg:border-b-0">
              <div className="border-b p-3">{statusTabs(["bot", "human"])}</div>
              {conversations.length ? (
                conversations.map((c) => (
                  <button
                    key={`${c.businessId}/${c.id}`}
                    aria-pressed={
                      selected?.businessId === c.businessId &&
                      selected?.id === c.id
                    }
                    onClick={() => { setSelected(c); setDraft(""); setTemplateId(""); setParameters([]); requestId.current = ""; }}
                    className={`flex w-full items-start gap-3 border-b p-4 text-left hover:bg-muted/40 ${selected?.businessId === c.businessId && selected?.id === c.id ? "bg-muted/60" : ""}`}
                  >
                    <BrandLogo vertical={c.vertical} decorative />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-1">
                        <span className="truncate text-sm font-medium">
                          {c.name}
                        </span>
                        {c.unread !== null && c.unread > 0 && (
                          <Badge>{c.unread}</Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.business} · {c.phone}
                      </p>
                      <p className="my-2 truncate text-xs">
                        {c.lastMessage || "No message preview"}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {c.status === "handed_off" ? "Human" : "Bot"}
                        </span>
                        <span>{date(c.at)}</span>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <Empty text="No matching conversations." />
              )}
            </div>
            <div className="flex min-w-0 flex-col">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                      <h2 className="text-sm font-semibold">{selected.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {selected.phone} · {selected.business}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={pending}>
                          {selected.status === "handed_off" ? (
                            <UserRound />
                          ) : (
                            <Bot />
                          )}
                          {selected.status === "handed_off"
                            ? "Human · Resume bot"
                            : "Bot · Hand off"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Change conversation ownership?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {selected.status === "handed_off"
                              ? "The bot will resume replying to new incoming messages."
                              : "Bot replies will pause so your team can reply from this inbox."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              save(selected.businessId, "handoff", {
                                id: selected.id,
                                human: selected.status !== "handed_off",
                              })
                            }
                          >
                            Confirm
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div
                    className="flex max-h-[500px] min-h-72 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4"
                    aria-label="Chat thread"
                  >
                    {data.messages
                      .filter(
                        (m) =>
                          m.businessId === selected.businessId &&
                          m.phone === selected.phone,
                      )
                      .map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-lg border px-3 py-2 ${m.direction === "outgoing" ? "self-end bg-primary/10" : "self-start bg-background"}`}
                        >
                          <div className="mb-1 text-[10px] uppercase text-muted-foreground">
                            {m.direction} · {m.type}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {m.text || `[${m.type} message]`}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            <time>{date(m.at)}</time>
                            <CheckCheck className="size-3" />
                            <span>{m.status}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="space-y-3 border-t p-4">
                    <Label htmlFor="reply">Reply</Label>
                    <Input
                      id="reply"
                      value={templateId ? draft.replace(/\{\{(\d+)\}\}/g, (match, n) => parameters[Number(n)-1] || match) : draft}
                      disabled={pending || !!templateId}
                      onChange={(e) => { setDraft(e.target.value); requestId.current = ""; }}
                      placeholder="Compose a message…"
                    />
                    {templateId && <div className="space-y-3"><p className="text-sm">Template: {data.templates.find(t => t.id === templateId)?.name}</p>{parameters.map((value, i) => <div className="space-y-1" key={i}><Label htmlFor={`template-value-${i}`}>Field {i + 1}</Label><Input id={`template-value-${i}`} value={value} onChange={e => { setParameters(parameters.map((p,j) => i === j ? e.target.value : p)); requestId.current = ""; }} /></div>)}<Button size="sm" variant="ghost" onClick={() => { setTemplateId(""); setParameters([]); setDraft(""); requestId.current = ""; }}>Use text reply</Button></div>}
                    <div className="flex flex-wrap gap-2">
                      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Templates
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Choose a template</DialogTitle>
                            <DialogDescription>
                              Choose an approved template for this customer.
                            </DialogDescription>
                          </DialogHeader>
                          {data.templates
                            .filter(
                              (t) =>
                                t.businessId === selected.businessId &&
                                t.status === "approved",
                            )
                            .map((t) => (
                              <Button
                                key={t.id}
                                variant="outline"
                                onClick={() => {
                                  setTemplateId(t.id); setDraft(t.body ?? ""); setTemplateOpen(false);
                                  const numbers = [...new Set(Array.from((t.body ?? "").matchAll(/\{\{(\d+)\}\}/g), match => Number(match[1])))];
                                  setParameters(numbers.map(() => "")); requestId.current = "";
                                }}
                              >
                                {t.name} · {t.language}
                              </Button>
                            ))}
                          {!data.templates.some(
                            (t) =>
                              t.businessId === selected.businessId &&
                              t.status === "approved",
                          ) && (
                            <Empty text="No approved templates available." />
                          )}
                        </DialogContent>
                      </Dialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>
                            <Button
                              size="icon"
                              variant="outline"
                              disabled
                              aria-label="Attachment unavailable"
                            >
                              <Paperclip />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Attachments are not connected
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>
                            <Button
                              size="icon"
                              variant="outline"
                              disabled
                              aria-label="Location unavailable"
                            >
                              <MapPin />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Location sending is not connected
                        </TooltipContent>
                      </Tooltip>
                      <Button size="sm" disabled={pending || (!draft.trim() && !templateId) || selected.status !== "handed_off" || parameters.some(p => !p.trim())} onClick={sendReply} className="ml-auto">
                        <Send />
                        {pending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Hand off to a human to reply. Outside the 24-hour reply window, choose an approved template.
                    </p>
                  </div>
                </>
              ) : (
                <Empty text="Select a conversation to view its thread." />
              )}
            </div>
          </div>
        </>
      )}
      {section === "contacts" && (
        <>
          {toolbar}
          {statusTabs(["active", "handed_off", "completed"])}
          <Panel title="WhatsApp contacts">
            {data.contacts.filter(
              (c) =>
                scoped(c.businessId) &&
                (filter === "all" || c.status === filter) &&
                match([c.name, c.phone, c.business, c.vertical]),
            ).length ? (
              <GridTable
                headers={[
                  "Name",
                  "Phone",
                  "Business",
                  "Vertical",
                  "Last interaction",
                  "Conversation",
                  "Messages",
                ]}
                rows={data.contacts
                  .filter(
                    (c) =>
                      scoped(c.businessId) &&
                      (filter === "all" || c.status === filter) &&
                      match([c.name, c.phone, c.business, c.vertical]),
                  )
                  .map((c) => [
                    c.name,
                    c.phone,
                    c.business,
                    c.vertical,
                    date(c.at),
                    <Status key="s" value={c.status} />,
                    c.total,
                  ])}
              />
            ) : (
              <Empty />
            )}
          </Panel>
        </>
      )}
      {section === "message-status" && (
        <>
          {toolbar}
          {statusTabs(["sent", "delivered", "read", "failed"])}
          <Notice>
            Delivery status is shown only when recorded. A processed outgoing
            message has an unknown delivery state until a receipt is stored.
          </Notice>
          <Panel title="Message log">{messageTable()}</Panel>
        </>
      )}
      {(section === "templates" || section === "campaigns") && (
        <>
          {toolbar}
          {statusTabs(
            section === "templates"
              ? ["approved", "pending", "rejected", "draft"]
              : ["draft", "scheduled", "running", "completed", "failed"],
          )}
          <Notice>
            {section === "templates"
              ? "Approved templates from this business can be used in the inbox."
              : "Create and manage campaign drafts here. Saving a draft does not send messages."}
          </Notice>
          {section === "campaigns" && (
            <CampaignDraft data={data} pending={pending} save={save} />
          )}
          <Panel
            title={
              section === "templates" ? "Template library" : "Campaign drafts"
            }
          >
            {(() => {
              const records = (
                section === "templates" ? data.templates : data.campaigns
              ).filter(
                (r) =>
                  scoped(r.businessId) &&
                  (filter === "all" || r.status === filter) &&
                  match([r.name, r.business, r.template, r.audience]),
              );
              return records.length ? (
                <GridTable
                  headers={
                    section === "templates"
                      ? [
                          "Name",
                          "Business",
                          "Language",
                          "Category",
                          "Status",
                          "Last updated",
                        ]
                      : [
                          "Campaign",
                          "Business",
                          "Template",
                          "Audience",
                          "Schedule (IST)",
                          "Status",
                        ]
                  }
                  rows={records.map((r) =>
                    section === "templates"
                      ? [
                          r.name,
                          r.business,
                          r.language,
                          r.category,
                          <Status key="s" value={r.status} />,
                          date(r.at),
                        ]
                      : [
                          r.name,
                          r.business,
                          r.template,
                          r.audience,
                          date(r.schedule),
                          <Status key="s" value={r.status} />,
                        ],
                  )}
                />
              ) : (
                <Empty />
              );
            })()}
          </Panel>
        </>
      )}
      {!client && section === "webhook-health" && (
        <>
          <Notice>
            Health is derived from stored message processing records.
            Verification, duplicate counts and latency are unknown until webhook
            instrumentation is connected.
          </Notice>
          <Panel title="Webhook diagnostics">{health}</Panel>
        </>
      )}
      {!client && section === "whatsapp-accounts" && (
        <>
          {toolbar}
          <Notice>
            Configured IDs do not prove a live connection. Quality rating and
            subscription status remain unknown until verified with Meta.
          </Notice>
          <div className="grid gap-4 xl:grid-cols-2">
            {data.accounts
              .filter(
                (a) =>
                  scoped(a.businessId) &&
                  match([a.business, a.phone, a.phoneNumberId]),
              )
              .map((a) => (
                <Account key={`${a.businessId}-${a.accountId ?? "legacy"}`} account={a} onUpdated={account => { setData(current => ({ ...current, accounts: current.accounts.map(existing => existing.businessId === account.businessId && (existing.accountId ?? existing.businessId) === account.accountId ? account : existing) })); router.refresh(); }} />
              ))}
          </div>
          {!data.accounts.length && (
            <Empty text="No WhatsApp accounts configured." />
          )}
        </>
      )}
      {!client && section === "setup-requests" && <Panel title="Setup Requests"><GridTable headers={["Business", "Display name", "Phone", "Status", "Requested", "Action"]} rows={(data.setupRequests ?? []).map(request => [request.business, request.displayName, request.phone, request.status, date(request.at), <Link key="manage" className="underline" href={`/business/${encodeURIComponent(request.businessId)}/whatsapp/setup`}>Review setup</Link>])} /></Panel>}
      {(section === "settings" || section === "automations") && (
        <>
          {!data.businessId ? (
            <Notice>
              Select a business workspace to edit its WhatsApp preferences and
              automation configuration.
            </Notice>
          ) : (
            <>
              <Notice>
                {client ? "Changes are saved for this business. Human handoff takes effect immediately; additional automation preferences require Tany activation." : section === "automations"
                  ? "Rules are configuration for future orchestration. Enabling a rule does not dispatch messages or override the existing 12 vertical flows. Inbox handoff takes effect immediately."
                  : "Preferences are saved per business for future orchestration. Timeout, retry and logging policies are not yet applied by the flow engine."}
              </Notice>
              {section === "automations" ? (
                <Panel title="Automation rules">
                  <div className="divide-y">
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center gap-4 p-4"
                      >
                        <div className="flex-1">
                          <h3 className="text-sm font-medium">{rule.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {data.businessName} · {rule.trigger}
                          </p>
                          <p className="mt-1 text-xs">{rule.action}</p>
                        </div>
                        <Switch
                          aria-label={`Enable ${rule.name}`}
                          checked={rule.enabled}
                          onCheckedChange={(enabled) =>
                            setRules(
                              rules.map((r) =>
                                r.id === rule.id ? { ...r, enabled } : r,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : (
                <Panel title={client ? "WhatsApp preferences" : "WhatsApp system preferences"}>
                  <div className="grid gap-5 p-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="behavior">Default behavior</Label>
                      <select
                        id="behavior"
                        className="h-9 w-full rounded-md border px-3 text-sm"
                        value={settings.defaultBehavior}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            defaultBehavior: e.target.value as "bot" | "human",
                          })
                        }
                      >
                        <option value="bot">Bot</option>
                        <option value="human">Human</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="handoff">
                        Allow human handoff (preference)
                      </Label>
                      <Switch
                        id="handoff"
                        checked={settings.handoffEnabled}
                        onCheckedChange={(handoffEnabled) =>
                          setSettings({ ...settings, handoffEnabled })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeout">
                        Conversation timeout (minutes)
                      </Label>
                      <Input
                        id="timeout"
                        type="number"
                        min={1}
                        max={10080}
                        value={settings.timeoutMinutes}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            timeoutMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="language">
                        Default template language
                      </Label>
                      <Input
                        id="language"
                        value={settings.templateLanguage}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            templateLanguage: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retries">Retry attempts (0–5)</Label>
                      <Input
                        id="retries"
                        type="number"
                        min={0}
                        max={5}
                        value={settings.retryAttempts}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            retryAttempts: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    {!client && (<div className="space-y-2">
                      <Label htmlFor="logging">Logging preference</Label>
                      <select
                        id="logging"
                        className="h-9 w-full rounded-md border px-3 text-sm"
                        value={settings.logging}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            logging: e.target.value as "minimal" | "standard",
                          })
                        }
                      >
                        <option value="minimal">Minimal</option>
                        <option value="standard">Standard</option>
                      </select>
                    </div>)}
                  </div>
                </Panel>
              )}
              <Button
                disabled={pending}
                onClick={() =>
                  save(data.businessId!, "configuration", {
                    settings,
                    automations: Object.fromEntries(
                      rules.map((r) => [r.id, r.enabled]),
                    ),
                  })
                }
              >
                {pending ? "Saving…" : "Save preferences"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function CampaignDraft({
  data,
  pending,
  save,
}: {
  data: OperationsData;
  pending: boolean;
  save: (id: string, kind: "campaign", input: unknown) => void;
}) {
  const [businessId, setBusinessId] = useState(data.businessId ?? "");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Create draft</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create campaign draft</DialogTitle>
          <DialogDescription>
            Save a plan. Campaign dispatch remains unavailable.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            save(businessId, "campaign", {
              name: form.get("name"),
              template: form.get("template"),
              audience: form.get("audience"),
              schedule: form.get("schedule"),
            });
          }}
        >
          <Label htmlFor="campaign-business">Business</Label>
          <select
            id="campaign-business"
            required
            className="h-9 w-full rounded-md border px-3 text-sm"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
          >
            <option value="">Choose business</option>
            {data.businessId && <option value={data.businessId}>{data.businessName}</option>}
            {data.accounts.map((a) => (
              <option key={a.businessId} value={a.businessId}>
                {a.business}
              </option>
            ))}
          </select>
          <Label htmlFor="campaign-name">Campaign name</Label>
          <Input id="campaign-name" name="name" required maxLength={120} />
          <Label htmlFor="campaign-template">Approved template</Label>
          <select
            key={businessId}
            id="campaign-template"
            name="template"
            required
            className="h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Choose template</option>
            {data.templates
              .filter(
                (t) => t.businessId === businessId && t.status === "approved",
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          <Label htmlFor="campaign-audience">Audience description</Label>
          <Input
            id="campaign-audience"
            name="audience"
            required
            maxLength={240}
          />
          <Label htmlFor="campaign-schedule">
            Planned schedule (ISO timestamp with timezone)
          </Label>
          <Input
            id="campaign-schedule"
            name="schedule"
            placeholder="2026-10-24T10:00:00+05:30"
          />
          <Button disabled={pending} type="submit">
            Save draft
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Account({ account: a, onUpdated }: { account: OperationAccount; onUpdated: (account: OperationAccount) => void }) {
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const details: React.ReactNode[][] = [
    ["Phone", a.phone ?? "Not recorded"],
    ["Display name", a.displayName],
    ["Phone Number ID", a.phoneNumberId ?? "Not configured"],
    ["WABA ID", a.wabaId ?? "Not recorded"],
    ["Connection", a.status],
    ["Quality rating", a.quality],
    ["Webhook subscription", a.subscription],
    ["Last activity", date(a.at)],
  ];
  return (
    <Card className="gap-4 p-4">
      <div className="flex items-center gap-3">
        <BrandLogo vertical={a.vertical} decorative />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{a.business}</h2>
          <p className="text-xs text-muted-foreground">
            {a.vertical} · {a.phone ?? "Number not recorded"}
          </p>
        </div>
      </div>
      <Status value={a.status} />
      {a.internalTestingActive && <p className="text-xs text-muted-foreground">Active for internal testing · Meta connectivity unverified</p>}
      <p className="text-xs text-muted-foreground">WABA ID: {a.wabaId ?? "Not recorded"}</p>
      <div className="flex flex-wrap gap-2">
        <AccountMetadataEditor account={a} onUpdated={onUpdated} />
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline">
              Open details
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{a.business}</SheetTitle>
              <SheetDescription>WhatsApp account metadata</SheetDescription>
            </SheetHeader>
            <GridTable headers={["Field", "Value"]} rows={details} />
          </SheetContent>
        </Sheet>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Diagnostics
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connection diagnostics</DialogTitle>
              <DialogDescription>
                Local configuration checks only. No Meta API request is made.
              </DialogDescription>
            </DialogHeader>
            <GridTable
              headers={["Check", "Result"]}
              rows={[
                [
                  "Phone Number ID",
                  a.phoneNumberId ? "Valid numeric ID" : "Missing or invalid",
                ],
                ["WABA ID", a.wabaId ? "Present" : "Missing"],
                ["Webhook activity", date(a.at)],
                ["Live connectivity", "Not verified"],
              ]}
            />
          </DialogContent>
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Local test
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Local test validation</DialogTitle>
              <DialogDescription>
                Validate a recipient and message without sending.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                startTransition(async () => {
                  const result = await previewWhatsAppTest(
                    a.businessId,
                    { ok: false, message: "" },
                    form,
                  );
                  setFeedback(result.message);
                });
              }}
            >
              <Label htmlFor={`recipient-${a.businessId}`}>
                Recipient with country code
              </Label>
              <Input
                id={`recipient-${a.businessId}`}
                name="recipient"
                required
                placeholder="919876543210"
              />
              <Label htmlFor={`message-${a.businessId}`}>Test message</Label>
              <Input
                id={`message-${a.businessId}`}
                name="message"
                required
                maxLength={1000}
              />
              <Button type="submit" disabled={pending}>
                Validate locally
              </Button>
              {feedback && (
                <p role="status" className="text-sm">
                  {feedback}
                </p>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
