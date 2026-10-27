"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  triggerOptions,
  conditionOptions,
  actionOptions,
  validateAutomation,
  type AutomationInput,
  type Automation,
  type Run,
  type Action,
} from "@/lib/automations/model";
import type { ProductAutomationTemplate } from "@/lib/automations/product-templates";
import { verticalConfig } from "@/lib/messaging/vertical-config";
import { getVerticalDefinition } from "@/lib/automations/vertical-registry";
import type { TanyVertical } from "@/lib/messaging/types";
import { automationPlaceholders } from "@/lib/automations/placeholders";
import { AutomationTemplateGallery } from "./template-gallery";
import { WhatsAppPreview } from "./whatsapp-preview";
import { previewMessages } from "./preview-messages";
import { templateToAutomationInput } from "./template-draft";
import {
  saveAutomationAction,
  changeAutomationAction,
} from "@/app/admin/automation-actions";
type Dashboard = {
  vertical: TanyVertical;
  automationTemplates: ProductAutomationTemplate[];
  automations: Automation[];
  runs: Run[];
  templates: { id: string; name: string; body: string }[];
};
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const blank = (): AutomationInput => ({
  name: "",
  description: "",
  trigger: { type: "customer.message.received" },
  conditions: [],
  actions: [{ type: "text", text: "Welcome! How can we help?" }],
});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const steps = ["Name", "Trigger", "Conditions", "Actions", "Review", "Publish"];
const formatRunTimestamp = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
      {hint && (
        <span className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function AutomationBuilder({
  businessId,
  businesses,
  data,
}: {
  businessId?: string;
  businesses: { id: string; name: string }[];
  data: Dashboard | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [previewFooter, setPreviewFooter] = useState("");
  const [creation, setCreation] = useState<"choose" | "templates" | null>(null);
  const [id, setId] = useState<string>();
  const [draft, setDraft] = useState<AutomationInput>(blank);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const verticalDefinition = getVerticalDefinition(data?.vertical);
  const allowedTriggers = verticalDefinition?.automationTriggers ?? Object.keys(triggerOptions);
  const allowedActions = verticalDefinition?.automationActions ?? Object.keys(actionOptions);
  useEffect(() => {
    if (!businessId || editing || creation) return;
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [businessId, editing, creation, router]);
  const open = (value: AutomationInput, existingId?: string) => {
    setCreation(null);
    setEditorTab("edit");
    setPreviewFooter("");
    setDraft(clone(value));
    setId(existingId);
    setStep(0);
    setMessage("");
    setEditing(true);
  };
  const useTemplate = (template: ProductAutomationTemplate) => {
    const localDraft = templateToAutomationInput(template);
    open(localDraft);
    setMessage(
      "Template loaded locally. Edit it, then save a draft or publish when ready.",
    );
  };
  const gallery = data && (
    <AutomationTemplateGallery
      product={verticalConfig[data.vertical].label}
      templates={data.automationTemplates}
      pending={pending}
      onUse={useTemplate}
      onScratch={() => open(blank())}
    />
  );
  const updateAction = (index: number, patch: Partial<Action>) =>
    setDraft((d) => ({
      ...d,
      actions: d.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  const save = (publish: boolean) =>
    startTransition(async () => {
      if (!businessId) return;
      try {
        validateAutomation(draft);
      } catch (e) {
        setMessage((e as Error).message);
        return;
      }
      const saved = await saveAutomationAction(businessId, id, draft);
      if (!saved.ok || !saved.id) {
        setMessage(saved.message ?? "Could not save.");
        return;
      }
      setId(saved.id);
      if (publish) {
        const result = await changeAutomationAction(
          businessId,
          saved.id,
          "publish",
        );
        if (!result.ok) {
          setMessage(result.message ?? "Could not publish.");
          router.refresh();
          return;
        }
      }
      setEditing(false);
      setMessage(publish ? "Automation published." : "Draft saved.");
      router.refresh();
    });
  const change = (
    automation: Automation,
    operation: "pause" | "resume" | "delete" | "duplicate",
  ) => {
    if (
      operation === "delete" &&
      !window.confirm(`Delete ?${automation.name}?? Run history will be kept.`)
    )
      return;
    startTransition(async () => {
      const result = await changeAutomationAction(
        businessId!,
        automation.id,
        operation,
      );
      setMessage(
        result.ok
          ? "Automation updated."
          : (result.message ?? "Could not update."),
      );
      router.refresh();
    });
  };
  const move = (index: number, offset: number) =>
    setDraft((d) => {
      const actions = [...d.actions];
      [actions[index], actions[index + offset]] = [
        actions[index + offset],
        actions[index],
      ];
      return { ...d, actions };
    });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {verticalDefinition?.description ?? "Create helpful WhatsApp journeys, one step at a time."}
          </p>
        </div>
        {businessId && !editing && (
          <Button
            disabled={pending}
            onClick={() => {
              setMessage("");
              setCreation("choose");
            }}
          >
            <Plus className="size-4" />
            Create Automation
          </Button>
        )}
      </div>
      {!businessId && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="font-medium">Choose a business workspace</h2>
            <p className="text-sm text-muted-foreground">
              Automations and run history belong to one business.
            </p>
            <select
              aria-label="Business workspace"
              className={selectClass}
              value=""
              onChange={(e) =>
                router.push(
                  `/business/${encodeURIComponent(e.target.value)}/automations`,
                )
              }
            >
              <option value="" disabled>
                Select a business
              </option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}
      {message && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {message}
        </p>
      )}
      {businessId && creation && !editing && (
        <div className="space-y-5">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setCreation(null)}
          >
            Back to automations
          </Button>
          {creation === "choose" ? (
            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="text-lg font-semibold">
                  How would you like to create your automation?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Start with a template for your product or build your own
                  steps.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    className="h-auto min-h-14 whitespace-normal py-4"
                    onClick={() => setCreation("templates")}
                  >
                    Use Recommended Template
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto min-h-14 whitespace-normal py-4"
                    onClick={() => open(blank())}
                  >
                    Start from Scratch
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            gallery
          )}
        </div>
      )}
      {businessId && editing ? (
        <>
          <nav aria-label="Builder progress">
            <ol className="flex flex-wrap gap-2">
              {steps.map((name, i) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={i === step ? "step" : undefined}
                    className={`rounded-full border px-3 py-2 text-sm ${i === step ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {i < step ? "?" : i + 1} {name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          {data?.vertical === "eats" && <div className="flex gap-2 lg:hidden" role="group" aria-label="Editor view">
            <Button variant={editorTab === "edit" ? "default" : "outline"} aria-pressed={editorTab === "edit"} onClick={() => setEditorTab("edit")}>Edit</Button>
            <Button variant={editorTab === "preview" ? "default" : "outline"} aria-pressed={editorTab === "preview"} onClick={() => setEditorTab("preview")}>Preview</Button>
          </div>}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
            <Card className={data?.vertical === "eats" && editorTab === "preview" ? "hidden lg:block" : ""}>
              <CardContent className="space-y-5 p-6">
                <h2 className="text-lg font-semibold">{steps[step]}</h2>
                {step === 0 && (
                  <>
                    <Field label="Automation name">
                      <Input
                        maxLength={120}
                        placeholder="Welcome new customers"
                        value={draft.name}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, name: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Description (optional)">
                      <textarea
                        className={`${selectClass} min-h-24 py-2`}
                        maxLength={1000}
                        value={draft.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            description: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <p className="text-sm text-muted-foreground">
                      Editing a published automation saves it as a draft.
                      Publish again when ready.
                    </p>
                  </>
                )}
                {step === 1 && (
                  <>
                    <Field label="When should this run?">
                      <select
                        className={selectClass}
                        value={draft.trigger.type}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            trigger: {
                              type: e.target
                                .value as AutomationInput["trigger"]["type"],
                            },
                          }))
                        }
                      >
                        {Object.entries(triggerOptions).filter(([v]) => allowedTriggers.includes(v as keyof typeof triggerOptions)).map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {draft.trigger.type === "keyword.matched" && (
                      <Field
                        label="Keywords"
                        hint="Separate keywords with commas. Matching ignores letter case."
                      >
                        <Input
                          value={draft.trigger.keywords?.join(",") ?? ""}
                          placeholder="hi,hello,price,book,order"
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              trigger: {
                                ...d.trigger,
                                keywords: e.target.value.split(","),
                              },
                            }))
                          }
                        />
                      </Field>
                    )}
                    {draft.trigger.type === "conversation.no_reply" && (
                      <Field
                        label="Hours without a reply"
                        hint="Runs once after a business message remains unanswered."
                      >
                        <Input
                          type="number"
                          min={1}
                          max={720}
                          value={draft.trigger.hours ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              trigger: {
                                ...d.trigger,
                                hours: Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </Field>
                    )}
                    {draft.trigger.type === "schedule.triggered" && (
                      <Field
                        label="Scheduled date and time (UTC)"
                        hint="Evaluated for each existing conversation in this business. Add conditions to narrow recipients. Outside the 24-hour reply window, use an approved template."
                      >
                        <Input
                          type="datetime-local"
                          value={draft.trigger.at?.slice(0, 16) ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              trigger: {
                                ...d.trigger,
                                at: e.target.value
                                  ? `${e.target.value}:00.000Z`
                                  : "",
                              },
                            }))
                          }
                        />
                      </Field>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      All conditions must match (AND). Leave empty to run
                      whenever the trigger matches. Times use India Standard
                      Time.
                    </p>
                    {draft.conditions.map((c, i) => (
                      <div key={i} className="space-y-3 rounded-md border p-4">
                        <Field label={`Condition ${i + 1}`}>
                          <select
                            className={selectClass}
                            value={c.type}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                conditions: d.conditions.map((v, n) =>
                                  n === i
                                    ? {
                                        type: e.target.value as typeof c.type,
                                        value: "",
                                      }
                                    : v,
                                ),
                              }))
                            }
                          >
                            {Object.entries(conditionOptions).map(
                              ([v, label]) => (
                                <option key={v} value={v}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>
                        <Field
                          label={
                            ["time_range", "business_hours"].includes(c.type)
                              ? "From (HH:MM)"
                              : "Value"
                          }
                          hint={
                            c.type === "day"
                              ? "0=Sunday, 1=Monday ? 6=Saturday; separate days with commas."
                              : c.type === "customer_type"
                                ? "Enter new or returning."
                                : undefined
                          }
                        >
                          <Input
                            type={
                              ["time_range", "business_hours"].includes(c.type)
                                ? "time"
                                : "text"
                            }
                            value={c.value}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                conditions: d.conditions.map((v, n) =>
                                  n === i ? { ...v, value: e.target.value } : v,
                                ),
                              }))
                            }
                          />
                        </Field>
                        {["time_range", "business_hours"].includes(c.type) && (
                          <Field label="Until (HH:MM)">
                            <Input
                              type="time"
                              value={c.end ?? ""}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  conditions: d.conditions.map((v, n) =>
                                    n === i ? { ...v, end: e.target.value } : v,
                                  ),
                                }))
                              }
                            />
                          </Field>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              conditions: d.conditions.filter(
                                (_, n) => n !== i,
                              ),
                            }))
                          }
                        >
                          Remove condition
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      disabled={draft.conditions.length >= 20}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          conditions: [
                            ...d.conditions,
                            { type: "keyword", value: "" },
                          ],
                        }))
                      }
                    >
                      <Plus />
                      Add condition
                    </Button>
                  </>
                )}
                {step === 3 && (
                  <>
                    {draft.actions.map((a, i) => (
                      <div key={i} className="space-y-3 rounded-md border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            Action {i + 1}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Move action ${i + 1} up`}
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Move action ${i + 1} down`}
                              disabled={i === draft.actions.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Remove action ${i + 1}`}
                              disabled={draft.actions.length === 1}
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  actions: d.actions.filter((_, n) => n !== i),
                                }))
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        <Field label="Action type">
                          <select
                            className={selectClass}
                            value={a.type}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                actions: d.actions.map((v, n) =>
                                  n === i
                                    ? { type: e.target.value as Action["type"] }
                                    : v,
                                ),
                              }))
                            }
                          >
                            {Object.entries(actionOptions).filter(([v]) => allowedActions.includes(v as Action["type"])).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {["text", "buttons", "list", "location"].includes(
                          a.type,
                        ) && (
                          <Field
                            label="Message"
                            hint={`Supported placeholders: ${automationPlaceholders.map((p) => `{{${p}}}`).join(", ")}. Required values must exist before sending.`}
                          >
                            <textarea
                              className={`${selectClass} min-h-24 py-2`}
                              value={a.text ?? ""}
                              maxLength={a.type === "text" ? 4096 : 1024}
                              onChange={(e) =>
                                updateAction(i, { text: e.target.value })
                              }
                            />
                          </Field>
                        )}
                        {["buttons", "list"].includes(a.type) && (
                          <Field
                            label="Choices"
                            hint={
                              a.type === "buttons"
                                ? "Up to 3 buttons, 20 characters each. Separate with commas."
                                : "Up to 10 list items, 24 characters each. Separate with commas."
                            }
                          >
                            <Input
                              value={a.choices?.join(",") ?? ""}
                              onChange={(e) =>
                                updateAction(i, {
                                  choices: e.target.value.split(","),
                                })
                              }
                            />
                          </Field>
                        )}
                        {a.type === "template" && (
                          <>
                            <Field label="Approved WhatsApp template">
                              <select
                                className={selectClass}
                                value={a.templateId ?? ""}
                                onChange={(e) =>
                                  updateAction(i, {
                                    templateId: e.target.value,
                                  })
                                }
                              >
                                <option value="">Choose a template</option>
                                {data?.templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field
                              label="Template parameters (one per line)"
                              hint="Text-only templates are supported in v1. Fill every numbered field in order."
                            >
                              <textarea
                                className={`${selectClass} min-h-20 py-2`}
                                value={a.parameters?.join("\n") ?? ""}
                                onChange={(e) =>
                                  updateAction(i, {
                                    parameters: e.target.value
                                      ? e.target.value.split("\n")
                                      : [],
                                  })
                                }
                              />
                            </Field>
                          </>
                        )}
                        {["tag", "state"].includes(a.type) && (
                          <Field
                            label={
                              a.type === "tag"
                                ? "Customer tag"
                                : "Conversation state"
                            }
                          >
                            <Input
                              value={a.value ?? ""}
                              onChange={(e) =>
                                updateAction(i, { value: e.target.value })
                              }
                            />
                          </Field>
                        )}
                        {a.type === "delay" && (
                          <Field
                            label="Wait (minutes)"
                            hint="The worker resumes the next action after this delay."
                          >
                            <Input
                              type="number"
                              min={1}
                              max={43200}
                              value={a.minutes ?? ""}
                              onChange={(e) =>
                                updateAction(i, {
                                  minutes: Number(e.target.value),
                                })
                              }
                            />
                          </Field>
                        )}
                        {a.type === "payment_link" && (
                          <p className="text-sm text-muted-foreground">
                            Only sends an existing verified Razorpay link for
                            this customer?s pending payment and order/booking.
                            No link is created.
                          </p>
                        )}
                        {a.type === "handoff" && (
                          <p className="text-sm text-muted-foreground">
                            Stops this automation and pauses bot replies until a
                            staff member resumes the conversation in Inbox.
                          </p>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      disabled={draft.actions.length >= 20}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          actions: [...d.actions, { type: "text", text: "" }],
                        }))
                      }
                    >
                      <Plus />
                      Add action
                    </Button>
                  </>
                )}
                {step === 4 && (
                  <div className="space-y-4 text-sm">
                    <h3 className="font-semibold">
                      {draft.name || "Untitled automation"}
                    </h3>
                    <p>{draft.description}</p>
                    <p>
                      <strong>WHEN</strong> {triggerOptions[draft.trigger.type]}{" "}
                      {draft.trigger.keywords?.join(", ")}
                    </p>
                    <p>
                      <strong>IF</strong>{" "}
                      {draft.conditions.length
                        ? draft.conditions
                            .map(
                              (c) =>
                                `${conditionOptions[c.type]}: ${c.value}${c.end ? `?${c.end}` : ""}`,
                            )
                            .join(" AND ")
                        : "No additional conditions"}
                    </p>
                    {draft.trigger.type === "schedule.triggered" && (
                      <p>
                        <strong>Scheduled (UTC):</strong>{" "}
                        {draft.trigger.at
                          ? new Date(draft.trigger.at).toISOString()
                          : "Choose a date/time"}
                      </p>
                    )}
                    <ol className="list-inside list-decimal space-y-2">
                      {draft.actions.map((a, i) => (
                        <li key={i}>
                          {actionOptions[a.type]} {a.text ?? a.value ?? ""}
                        </li>
                      ))}
                    </ol>
                    <p className="text-muted-foreground">
                      New automations only affect future events. Existing order,
                      booking and payment records are preserved.
                    </p>
                  </div>
                )}
                {step === 5 && (
                  <div className="space-y-4">
                    <Check className="size-8 text-primary" />
                    <h3 className="font-semibold">Ready to publish?</h3>
                    <p className="text-sm text-muted-foreground">
                      Publishing activates this automation for this business.
                      Messaging requires a linked customer and a configured,
                      entitled WhatsApp sender. Delays, reminders and scheduled
                      automations require the scheduled worker.
                    </p>
                    <Button disabled={pending} onClick={() => save(true)}>
                      Publish Automation
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap justify-between gap-3 border-t pt-5">
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditing(false);
                      setMessage("");
                    }}
                  >
                    Cancel editing
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => save(false)}
                    >
                      Save draft
                    </Button>
                    {step > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setStep((s) => s - 1)}
                      >
                        Back
                      </Button>
                    )}
                    {step < 5 && (
                      <Button
                        onClick={() => {
                          if (step === 3) {
                            try {
                              validateAutomation(draft);
                            } catch (e) {
                              setMessage((e as Error).message);
                              return;
                            }
                          }
                          setMessage("");
                          setStep((s) => s + 1);
                        }}
                      >
                        Continue
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <aside className={`min-w-0 space-y-3 lg:sticky lg:top-6 ${data?.vertical === "eats" && editorTab === "edit" ? "hidden lg:block" : ""}`}>
              <WhatsAppPreview messages={previewMessages(draft.actions, "Demo Restaurant", data?.templates)} title={draft.name || "Your automation"} footer={previewFooter} vertical={data?.vertical} />
              <details className="rounded-lg border p-4 text-sm">
                <summary className="cursor-pointer font-medium">Preview sample details</summary>
                <div className="mt-4 space-y-4">
                  <p className="text-xs text-muted-foreground">For this preview only. These sample details are not saved or sent.</p>
                  <Field label="Sample footer (optional)"><Input value={previewFooter} onChange={e => setPreviewFooter(e.target.value)} /></Field>
                </div>
              </details>
            </aside>
          </div>
        </>
      ) : (
        businessId &&
        !creation && (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    {[
                      "Automation",
                      "Trigger",
                      "Status",
                      "Last run",
                      "Runs",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap p-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.automations.map((a) => {
                    const runs = data.runs.filter(
                      (r) => r.automationId === a.id,
                    );
                    return (
                      <tr key={a.id} className="border-t">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3">
                          {triggerOptions[a.trigger.type]}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{a.status}</Badge>
                        </td>
                        <td className="p-3">
                          {runs[0]?.startedAt
                            ? formatRunTimestamp(runs[0].startedAt)
                            : "Never"}
                        </td>
                        <td className="p-3">{runs.length}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => open(a, a.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => change(a, "duplicate")}
                            >
                              Duplicate
                            </Button>
                            {a.status !== "draft" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() =>
                                  change(
                                    a,
                                    a.status === "active" ? "pause" : "resume",
                                  )
                                }
                              >
                                {a.status === "active" ? "Pause" : "Resume"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => change(a, "delete")}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!data?.automations.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-8 text-center text-muted-foreground"
                      >
                        No automations yet. Create one or start with a template
                        below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {gallery}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Recent runs</h2>
              <p className="text-sm text-muted-foreground">
                Automatic execution is attempted once. Failed or interrupted
                sends require review to avoid duplicate customer messages.
              </p>
              <div className="space-y-2">
                {data?.runs.slice(0, 25).map((r) => (
                  <div key={r.id} className="rounded-lg border p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {data.automations.find((a) => a.id === r.automationId)
                          ?.name ?? "Deleted automation"}
                      </span>
                      <Badge variant="outline">{r.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.trigger} ? {r.actionsExecuted} actions ?{" "}
                      {r.startedAt
                        ? formatRunTimestamp(r.startedAt)
                        : "Pending"}
                    </p>
                    {r.error && <p className="mt-2 text-sm">{r.error}</p>}
                  </div>
                ))}
                {!data?.runs.length && (
                  <p className="rounded-lg border p-6 text-sm text-muted-foreground">
                    Run history will appear here after an automation is
                    triggered.
                  </p>
                )}
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
