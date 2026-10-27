"use client";

import { Switch } from "@/components/ui/switch";

import { FormSelect } from "./form-select";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
  Plus,
  Package,
  Search,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";

import { Card } from "@/components/ui/card";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";

import { startTransition, useActionState, useEffect, useState } from "react";

import {
  deleteCatalogAction,
  saveCatalogAction,
  toggleCatalogAction,
} from "@/app/admin/actions";

import type { AdminBusiness, AdminCatalogItem } from "@/lib/admin/types";

import type { TanyVertical } from "@/lib/messaging/types";

import { Badge, Feedback, Field, initialActionState } from "./shared";

const examples: Record<TanyVertical, object> = {
  eats: { aliases: [], veg: false, preparationTime: 20 },

  salon: { aliases: [], durationMinutes: 30, staffIds: [] },

  motos: {
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    transmission: "Automatic",
    bodyType: "",
    variant: "",
  },

  cabs: { aliases: [] },
  retail: { aliases: [], variants: [], stock: 0 },

  ecom: { aliases: [] },
  garage: { aliases: [], durationMinutes: 60, resourceType: "vehicle" },

  meds: { aliases: [], otcEligible: false, prescriptionRequired: true },

  meat: { aliases: [], variants: [] },
  expert: { aliases: [], durationMinutes: 60, resourceType: "expert" },

  gaming: { aliases: [], durationMinutes: 60, resourceType: "station" },
  sport: { aliases: [], durationMinutes: 60, resourceType: "venue" },
};

const defaultType = (vertical: TanyVertical) =>
  ["salon", "garage", "expert", "gaming", "sport"].includes(vertical)
    ? "service"
    : ["motos", "cabs"].includes(vertical)
      ? "vehicle"
      : vertical === "ecom"
        ? "category"
        : "product";

function editorMetadata(business: AdminBusiness, item?: AdminCatalogItem) {
  if (!item) return examples[business.vertical];

  const metadata = { ...item.metadata };

  if (business.vertical === "meds") {
    metadata.otcEligible = metadata.otcEligible ?? metadata.otc ?? false;

    metadata.prescriptionRequired =
      metadata.prescriptionRequired ?? metadata.requiresPrescription ?? true;

    delete metadata.otc;
    delete metadata.requiresPrescription;
  }

  return metadata;
}

function CatalogForm({
  business,
  item,
  onSaved,
  onCancel,
}: {
  business: AdminBusiness;
  item?: AdminCatalogItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    saveCatalogAction.bind(null, business.id, item?.id ?? null),
    initialActionState,
  );

  const [data, setData] = useState({
    name: item?.name ?? "",
    type: item?.type ?? defaultType(business.vertical),
    category: item?.category ?? "",
    description: item?.description ?? "",
    price: item ? String(item.price) : "",
    available: item?.available ?? true,
    metadata: JSON.stringify(editorMetadata(business, item), null, 2),
  });

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state.ok, onSaved]);

  const inputProps = (name: keyof typeof data) => ({
    id: name,
    name,
    className: "w-full",
    "aria-invalid": !!state.errors?.[name],
    "aria-describedby": state.errors?.[name] ? `${name}-error` : undefined,
  });

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form action={action} className=" space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {item ? `Edit ${item.name}` : "Add catalog item"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Saving to {business.name} ·{" "}
              <span className="font-mono">{business.id}</span>
            </p>
          </div>
          <Button
            variant="ghost"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            Close
          </Button>
        </div>

        <Feedback state={state} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item name" name="name" error={state.errors?.name}>
            <Input
              {...inputProps("name")}
              required
              maxLength={160}
              value={data.name}
              onChange={(event) =>
                setData({ ...data, name: event.target.value })
              }
            />
          </Field>

          <Field label="Type" name="type" error={state.errors?.type}>
            <FormSelect
              id="type"
              name="type"
              value={data.type}
              options={["product", "service", "vehicle", "category"].map(
                (type) => ({ value: type, label: type }),
              )}
              aria-invalid={!!state.errors?.type}
              aria-describedby={state.errors?.type ? "type-error" : undefined}
              onValueChange={(type) => setData({ ...data, type })}
            />
          </Field>

          <Field
            label="Category"
            name="category"
            error={state.errors?.category}
          >
            <Input
              {...inputProps("category")}
              maxLength={100}
              value={data.category}
              onChange={(event) =>
                setData({ ...data, category: event.target.value })
              }
            />
          </Field>

          <Field label="Price · INR" name="price" error={state.errors?.price}>
            <Input
              {...inputProps("price")}
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={data.price}
              onChange={(event) =>
                setData({ ...data, price: event.target.value })
              }
            />
          </Field>
        </div>

        <Field
          label="Description"
          name="description"
          error={state.errors?.description}
        >
          <Textarea
            {...inputProps("description")}
            rows={3}
            maxLength={2000}
            value={data.description}
            onChange={(event) =>
              setData({ ...data, description: event.target.value })
            }
          />
        </Field>

        <label className="flex items-center gap-3 text-sm">
          <Switch
            id="available"
            name="available"
            checked={data.available}
            onCheckedChange={(available) => setData({ ...data, available })}
          />
          Available to customers
        </label>

        <Field
          label="Metadata · JSON"
          name="metadata"
          error={state.errors?.metadata}
          hint={`Suggested fields for ${business.vertical}: ${Object.keys(examples[business.vertical]).join(", ")}. You can keep additional keys. Meds eligibility keys are mapped to the messaging engine automatically.`}
        >
          <Textarea
            {...inputProps("metadata")}
            spellCheck={false}
            rows={10}
            maxLength={32000}
            className="w-full font-mono"
            value={data.metadata}
            onChange={(event) =>
              setData({ ...data, metadata: event.target.value })
            }
          />
        </Field>

        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <Button
            variant="outline"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button disabled={pending}>
            {pending ? "Saving…" : item ? "Save item" : "Add item"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CatalogRowActions({
  businessId,
  item,
  onEdit,
  onDelete,
}: {
  businessId: string;
  item: AdminCatalogItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [state, action, pending] = useActionState(
    toggleCatalogAction.bind(null, businessId, item.id, !item.available),
    initialActionState,
  );
  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`Actions for ${item.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Item actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit item
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={() => startTransition(() => action(new FormData()))}
          >
            <Power />
            {item.available ? "Mark unavailable" : "Mark available"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!state.ok && <Feedback state={state} />}
    </div>
  );
}

function DeleteDialog({
  business,
  item,
  onClose,
}: {
  business: AdminBusiness;
  item: AdminCatalogItem;
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");

  const [state, action, pending] = useActionState(
    deleteCatalogAction.bind(null, business.id, item.id),
    initialActionState,
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent className="max-w-[calc(100%-2rem)] p-6 sm:max-w-lg">
        <form action={action} className="space-y-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete catalog item?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{item.name}</strong> from{" "}
              <strong>{business.name}</strong>? This cannot be undone. Existing
              order and booking records are retained.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Feedback state={state} />

          <Field
            label="Type DELETE to confirm"
            name="confirmation"
            error={state.errors?.confirmation}
          >
            <Input
              autoComplete="off"
              className="font-mono"
              id="confirmation"
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={!!state.errors?.confirmation}
              aria-describedby={
                state.errors?.confirmation ? "confirmation-error" : undefined
              }
              required
            />
          </Field>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={pending}
            >
              Keep item
            </Button>
            <Button
              variant="destructive"
              disabled={pending || confirmation !== "DELETE"}
            >
              {pending ? "Deleting?" : "Delete item"}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CatalogPanel({
  business,
  items,
}: {
  business: AdminBusiness;
  items: AdminCatalogItem[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<AdminCatalogItem | null>(null);

  const [search, setSearch] = useState("");

  const filtered = items.filter((item) =>
    `${item.name} ${item.category ?? ""} ${item.type}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {items.length} items · {items.filter((item) => item.available).length}{" "}
          available
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus />
          Add item
        </Button>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto p-0 sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">
            {editing === "new" ? "Add catalog item" : "Edit catalog item"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Manage catalog data for {business.name}.
          </DialogDescription>
          {editing && (
            <CatalogForm
              key={editing}
              business={business}
              item={items.find((item) => item.id === editing)}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Card className="gap-0 py-0 shadow-sm overflow-hidden">
        <div className="border-b border-border p-4">
          <label className="relative block max-w-sm">
            <Search
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Search catalog</span>
            <Input
              className="h-9 w-full pl-9"
              type="search"
              placeholder="Search items, categories, or types"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        {filtered.length ? (
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[680px]">
              <TableCaption className="sr-only">
                Catalog for {business.name}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Price</TableHead>
                  <TableHead scope="col">Availability</TableHead>
                  <TableHead scope="col" className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-64">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell>
                      <span className="rounded bg-secondary px-2 py-1 text-xs">
                        {item.type}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                      }).format(item.price)}
                    </TableCell>
                    <TableCell>
                      <Badge active={item.available} available />
                    </TableCell>
                    <TableCell>
                      <CatalogRowActions
                        businessId={business.id}
                        item={item}
                        onEdit={() => setEditing(item.id)}
                        onDelete={() => setDeleting(item)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-muted/50">
              <Package
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <h3 className="font-medium">
              {items.length
                ? "No items match your search"
                : "Build this business’s catalog"}
            </h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {items.length
                ? "Try another name or category."
                : "Add products, services, or inventory to make them available in its messaging flow."}
            </p>
          </div>
        )}
      </Card>
      {deleting && (
        <DeleteDialog
          business={business}
          item={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
