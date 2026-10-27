"use client";

import { Switch } from "@/components/ui/switch";

import { FormSelect } from "./form-select";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";

import { Card } from "@/components/ui/card";

import { useActionState, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { saveBusinessAction } from "@/app/admin/actions";

import { verticalConfig } from "@/lib/messaging/vertical-config";

import { slugifyBusinessName } from "@/lib/admin/validation";

import type { AdminBusiness } from "@/lib/admin/types";

import { Feedback, Field, initialActionState } from "./shared";

export function BusinessForm({
  business,
  showPlan = true,
}: {
  business?: AdminBusiness;
  showPlan?: boolean;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState(
    saveBusinessAction.bind(null, business?.id ?? null),
    initialActionState,
  );

  const [data, setData] = useState({
    name: business?.name ?? "",
    businessId: business?.id ?? "",
    vertical: business?.vertical ?? "eats",
    whatsappPhoneNumberId: business?.whatsappPhoneNumberId ?? "",
    active: business?.active ?? true,
    settings: JSON.stringify(business?.settings ?? {}, null, 2),
  });

  let planSettings: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(data.settings);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      planSettings = parsed as Record<string, unknown>;
  } catch {
    /* JSON validation remains in the existing service. */
  }
  const updatePlan = (key: string, value: string) => {
    if (planSettings)
      setData({
        ...data,
        settings: JSON.stringify({ ...planSettings, [key]: value }, null, 2),
      });
  };
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    if (state.ok && !business && state.businessId)
      router.push(`/admin/businesses/${encodeURIComponent(state.businessId)}`);
  }, [state, business, router]);

  const errorProps = (name: string) => ({
    "aria-invalid": !!state.errors?.[name],
    "aria-describedby": state.errors?.[name]
      ? `${name}-error`
      : ["businessId", "whatsappPhoneNumberId", "settings"].includes(name)
        ? `${name}-hint`
        : undefined,
  });

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form action={action} className=" space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Business profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The profile used by your WhatsApp messaging flows.
          </p>
        </div>

        <Feedback state={state} />

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Business name" name="name" error={state.errors?.name}>
            <Input
              className="w-full"
              id="name"
              name="name"
              required
              maxLength={120}
              value={data.name}
              {...errorProps("name")}
              onChange={(event) => {
                const name = event.target.value;
                setData({
                  ...data,
                  name,
                  ...(!business && !slugEdited
                    ? { businessId: slugifyBusinessName(name) }
                    : {}),
                });
              }}
            />
          </Field>

          <Field
            label="Business ID"
            name="businessId"
            error={state.errors?.businessId}
            hint={
              business
                ? "This ID is permanent. Catalog items stay attached to this business."
                : "Generated from the name. Edit it before saving if needed."
            }
          >
            <Input
              className="w-full font-mono"
              id="businessId"
              name="businessId"
              readOnly={!!business}
              required
              maxLength={80}
              pattern={business ? undefined : "[a-z0-9]+(-[a-z0-9]+)*"}
              value={data.businessId}
              {...errorProps("businessId")}
              onChange={(event) => {
                setSlugEdited(true);
                setData({ ...data, businessId: event.target.value });
              }}
            />
          </Field>

          <Field
            label="Tany vertical"
            name="vertical"
            error={state.errors?.vertical}
          >
            <FormSelect
              id="vertical"
              name="vertical"
              value={data.vertical}
              options={Object.values(verticalConfig).map((vertical) => ({
                value: vertical.key,
                label: vertical.label,
              }))}
              {...errorProps("vertical")}
              onValueChange={(vertical) =>
                setData({ ...data, vertical: vertical as typeof data.vertical })
              }
            />
          </Field>

          <Field
            label="WhatsApp phone number ID"
            name="whatsappPhoneNumberId"
            error={state.errors?.whatsappPhoneNumberId}
            hint="Use the Meta phone number ID, not a customer's phone number."
          >
            <Input
              className="w-full font-mono"
              id="whatsappPhoneNumberId"
              name="whatsappPhoneNumberId"
              required
              maxLength={100}
              value={data.whatsappPhoneNumberId}
              {...errorProps("whatsappPhoneNumberId")}
              onChange={(event) =>
                setData({ ...data, whatsappPhoneNumberId: event.target.value })
              }
            />
          </Field>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-border p-4">
          <Switch
            id="active"
            name="active"
            checked={data.active}
            onCheckedChange={(active) => setData({ ...data, active })}
          />
          <span>
            <span className="block text-sm font-medium">
              Business is active
            </span>
            <span className="text-xs text-muted-foreground">
              Active businesses can be matched by the messaging webhook.
            </span>
          </span>
        </label>

        {showPlan && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Plan"
              name="plan"
              hint="Optional metadata stored in settings.plan."
            >
              <Input
                id="plan"
                maxLength={120}
                disabled={!planSettings}
                value={
                  typeof planSettings?.plan === "string"
                    ? planSettings.plan
                    : ""
                }
                onChange={(event) => updatePlan("plan", event.target.value)}
              />
            </Field>
            <Field
              label="Plan status"
              name="subscriptionStatus"
              hint="Optional metadata stored in settings.subscriptionStatus."
            >
              <Input
                id="subscriptionStatus"
                maxLength={120}
                disabled={!planSettings}
                value={
                  typeof planSettings?.subscriptionStatus === "string"
                    ? planSettings.subscriptionStatus
                    : ""
                }
                onChange={(event) =>
                  updatePlan("subscriptionStatus", event.target.value)
                }
              />
            </Field>
          </div>
        )}
        <Field
          label="Business settings · JSON"
          name="settings"
          error={state.errors?.settings}
          hint="Keep flexible settings here: staff, vehicleTypes, quoteSettings, or other business options."
        >
          <Textarea
            id="settings"
            name="settings"
            spellCheck={false}
            rows={8}
            maxLength={32000}
            className="w-full font-mono"
            value={data.settings}
            {...errorProps("settings")}
            onChange={(event) =>
              setData({ ...data, settings: event.target.value })
            }
          />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
          <Button disabled={pending}>
            {pending
              ? "Saving…"
              : business
                ? "Save changes"
                : "Create business"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
