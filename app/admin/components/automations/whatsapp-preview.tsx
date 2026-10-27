"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, RotateCcw, UtensilsCrossed } from "lucide-react";
import type { PreviewMessage } from "./preview-messages";
import { continueChat, initialChat, previewScenarioKey, type ChatAction, type ChatEntry } from "./chat-simulator";

function Bubble({ entry, onAction }: { entry: ChatEntry; onAction: (action: ChatAction) => void }) {
  const customer = entry.from === "customer";
  return <div className={`flex animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none ${customer ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[88%] overflow-hidden rounded-2xl px-3 py-2 shadow-sm ${customer ? "rounded-br-sm bg-emerald-200 text-emerald-950" : "rounded-bl-sm bg-white text-stone-900"}`}>
      {entry.kind === "menu" && <div className="mb-2 flex items-center gap-2 rounded-lg bg-stone-100 p-2 text-xs text-stone-600"><UtensilsCrossed className="size-4" aria-hidden="true" />Sample menu</div>}
      {entry.kind === "order" && <div className="mb-2 whitespace-pre-line rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs">{entry.text}</div>}
      {entry.kind !== "order" && <p className="whitespace-pre-line break-words text-sm leading-5">{entry.text}</p>}
      <p className="mt-1 text-right text-[10px] text-stone-500">10:24 AM</p>
      {entry.actions?.map((action) => <button key={action.id} type="button" data-preview-action={action.id} className="-mx-3 mt-2 flex min-h-11 w-[calc(100%+1.5rem)] items-center justify-center border-t border-stone-200 px-3 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-700" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAction(action); }}>{action.label}</button>)}
    </div>
  </div>;
}

export function WhatsAppPreview({ messages, title, footer, templateId, vertical = "eats" }: {
  messages: PreviewMessage[]; title?: string; footer?: string; templateId?: string; vertical?: string;
}) {
  // The simulator uses static local data only. It deliberately receives no business,
  // router, API, or messaging-service capability.
  const demoBusinessName = vertical === "motos" ? "Demo Motors" : vertical === "cabs" ? "Demo Cabs" : "Demo Restaurant";
  const scenario = useMemo(() => previewScenarioKey(templateId, title, vertical), [templateId, title, vertical]);
  const useTemplateSample = Boolean(templateId);
  const seed = () => initialChat(scenario, demoBusinessName, messages, useTemplateSample);
  const [entries, setEntries] = useState<ChatEntry[]>(seed);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Do not return scrollIntoView(): newer browser implementations can return
    // a Promise, which React would treat as an invalid effect cleanup function.
    chatEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries]);
  const choose = (action: ChatAction) => setEntries(current => [...current, ...continueChat(action)]);
  const restart = () => setEntries(seed());

  return <section aria-label="WhatsApp Preview" className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
      <div><h3 className="font-semibold">WhatsApp Preview</h3><p className="mt-1 text-xs text-muted-foreground">Try it like your customer would</p>{title && <p className="mt-2 text-sm font-medium">{title}</p>}</div>
      <button type="button" data-preview-action="restart" onClick={(event) => { event.preventDefault(); event.stopPropagation(); restart(); }} className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Restart preview"><RotateCcw className="size-4" aria-hidden="true" />Restart</button>
    </div>
    <div className="flex items-center gap-3 bg-emerald-950 px-4 py-3 text-white"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-800"><MessageCircle className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{demoBusinessName}</p><p className="text-xs text-emerald-100">Business account</p></div></div>
    <div className="max-h-[60vh] min-h-80 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,rgba(120,113,108,.12)_1px,transparent_0)] bg-[size:18px_18px] bg-stone-100 p-4 dark:bg-stone-900">
      <p className="text-center text-[11px] text-muted-foreground">Today</p>
      {entries.map((entry, index) => <Bubble entry={entry} key={`${entry.id}-${index}`} onAction={choose} />)}
      <div ref={chatEnd} />
    </div>
    {footer && <p className="border-t px-4 py-2 text-xs text-muted-foreground">{footer}</p>}
    <p className="border-t px-4 py-3 text-xs text-muted-foreground">Preview only — nothing is sent</p>
  </section>;
}
