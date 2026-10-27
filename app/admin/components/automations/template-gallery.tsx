"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ProductAutomationTemplate } from "@/lib/automations/product-templates";
import { eatsFilters, eatsTemplateCards, type EatsFilter } from "./eats-template-presentation";
import { WhatsAppPreview } from "./whatsapp-preview";
import { previewMessages } from "./preview-messages";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function AutomationTemplateGallery({
  product,
  templates,
  pending,
  onUse,
  onScratch,
}: {
  product: string;
  templates: ProductAutomationTemplate[];
  pending: boolean;
  onUse: (template: ProductAutomationTemplate) => void;
  onScratch: () => void;
}) {
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<EatsFilter>("Recommended");
  const [selectedId, setSelectedId] = useState("eats_welcome_product");
  const [mobilePreview, setMobilePreview] = useState(false);
  const cards = eatsTemplateCards(templates, filter);
  const selected = cards.find(c => c.template.id === selectedId) ?? cards[0];
  const preview = selected && <WhatsAppPreview key={selected.template.id} title={selected.display.name} templateId={selected.template.id} messages={previewMessages(selected.template.actions, "Demo Restaurant")} />;
  const isEats = templates.some(t => t.vertical === "eats");
  const visible = templates.filter((t) => t.active && (all || t.recommended));
  if (isEats) return (
    <section className="space-y-5" aria-label="Automation templates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Choose what WhatsApp should do for you</h2>
          <p className="mt-2 text-sm text-muted-foreground">Pick an automation and see exactly what your customer will receive.</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={onScratch}>Start from Scratch</Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter templates">
        {eatsFilters.map(value => <Button key={value} className="min-h-11" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</Button>)}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
        {cards.map(({template, display}) => (
          <Card key={template.id} onClick={() => setSelectedId(template.id)} className={`h-full cursor-pointer py-0 transition-colors ${selected?.template.id === template.id ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/40"}`}>
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div>
                <h3 className="text-base font-semibold"><button type="button" className="min-h-11 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" aria-pressed={selected?.template.id === template.id} onClick={() => setSelectedId(template.id)}>{display.name}</button></h3>
                <div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{display.category}</Badge>{display.recommended && <Badge>Recommended</Badge>}</div>
              </div>
              <dl className="flex-1 space-y-3 text-sm leading-6">
                <div><dt className="inline font-medium">When: </dt><dd className="inline text-muted-foreground">{display.when}</dd></div>
                <div><dt className="inline font-medium">Does: </dt><dd className="inline text-muted-foreground">{display.does}</dd></div>
              </dl>
              <div className="mt-auto space-y-2">
                <Button className="min-h-11 w-full lg:hidden" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedId(template.id); setMobilePreview(true); }} aria-label={`Preview ${display.name}`}>Preview</Button>
                <Button className="min-h-11 w-full" disabled={pending} aria-label={`Preview & use: ${display.name}`} onClick={() => { setSelectedId(template.id); onUse(template); }}>Preview &amp; use</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <aside className="sticky top-6 hidden min-w-0 lg:block" aria-live="polite" aria-atomic="true">{preview}</aside>
      </div>
      <Dialog open={mobilePreview} onOpenChange={setMobilePreview}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogTitle>{selected?.display.name ?? "Template preview"}</DialogTitle>
          <DialogDescription>See the sample customer message before using this template.</DialogDescription>
          {preview}
          <Button disabled={pending || !selected} onClick={() => { if (selected) { setMobilePreview(false); onUse(selected.template); } }}>Preview &amp; use</Button>
        </DialogContent>
      </Dialog>
      {!eatsTemplateCards(templates, filter).length && <p role="status" className="rounded-lg border p-5 text-sm text-muted-foreground">No templates in this category. Choose All to see more.</p>}
    </section>
  );
  return (
    <section className="space-y-4" aria-label="Automation templates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {all
              ? `All templates for ${product}`
              : `Recommended for ${product}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a template to create an editable draft, then review and publish.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setAll((v) => !v)}
          >
            {all ? "Show recommended" : "View all templates"}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={onScratch}>
            Start from Scratch
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((t) => (
          <Card key={t.id} className="h-full">
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t.category}</Badge>
                {t.recommended && <Badge>Recommended</Badge>}
              </div>
              <h3 className="font-semibold">{t.name}</h3>
              <p className="flex-1 text-sm text-muted-foreground">
                {t.description}
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending}
                aria-label={`Use Template: ${t.name}`}
                onClick={() => onUse(t)}
              >
                Use Template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {!visible.length && (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No recommended templates available. View all templates or start from
          scratch.
        </p>
      )}
    </section>
  );
}
