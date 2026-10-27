"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  saveWhatsAppCatalog,
  saveWhatsAppProductMapping,
} from "@/app/admin/catalog-actions";
export function WhatsAppCatalogSettings({
  businessId,
  config,
  products,
}: {
  businessId: string;
  config: {
    catalogId: string;
    catalogEnabled: boolean;
    hasAccount: boolean;
    mappings: { tanyProductId: string; retailerProductId: string }[];
  };
  products: { id: string; name: string }[];
}) {
  const [catalogId, setCatalogId] = useState(config.catalogId),
    [enabled, setEnabled] = useState(config.catalogEnabled),
    [message, setMessage] = useState("");
  const [mapping, setMapping] = useState(
    Object.fromEntries(
      config.mappings.map((m) => [m.tanyProductId, m.retailerProductId]),
    ),
  );
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">WhatsApp product catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Firestore menu buttons and lists work by default. Enable a linked
            Meta catalog to show native product images, names and prices from
            that catalog.
          </p>
        </div>
        {!config.hasAccount && (
          <p className="text-sm text-muted-foreground">
            Set up a WhatsApp account before enabling Meta catalog messages.
            Your Firestore menu remains available.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!config.hasAccount || pending}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable Meta catalog messages
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Meta catalog ID
          <Input
            value={catalogId}
            disabled={!config.hasAccount || pending}
            onChange={(e) => setCatalogId(e.target.value)}
          />
        </label>
        <Button
          disabled={!config.hasAccount || pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveWhatsAppCatalog(
                businessId,
                catalogId,
                enabled,
              );
              setMessage(
                r.ok
                  ? "Catalog settings saved."
                  : (r.message ?? "Could not save."),
              );
            })
          }
        >
          Save catalog settings
        </Button>
        <p className="text-xs text-muted-foreground">
          The catalog must already be linked to this WhatsApp account in Meta.
          Tany uses its own menu prices at checkout.
        </p>
        <div className="space-y-3">
          <h3 className="font-medium">Product mappings</h3>
          <p className="text-sm text-muted-foreground">
            Map Tany items to their Meta retailer product IDs. Missing mappings
            automatically use the Firestore menu.
          </p>
          {products.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-end gap-3 rounded-md border p-3"
            >
              <label className="grid min-w-48 flex-1 gap-2 text-sm">
                {p.name}
                <Input
                  aria-label={`Retailer product ID for ${p.name}`}
                  value={mapping[p.id] ?? ""}
                  disabled={!config.hasAccount || pending}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [p.id]: e.target.value }))
                  }
                />
              </label>
              <Button
                variant="outline"
                disabled={!config.hasAccount || pending || !mapping[p.id]}
                onClick={() =>
                  startTransition(async () => {
                    const r = await saveWhatsAppProductMapping(
                      businessId,
                      p.id,
                      mapping[p.id],
                    );
                    setMessage(
                      r.ok
                        ? "Product mapping saved."
                        : (r.message ?? "Could not save."),
                    );
                  })
                }
              >
                Save mapping
              </Button>
            </div>
          ))}
        </div>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
