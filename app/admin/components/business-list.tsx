"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import {
  Building2,
  CircleCheck,
  Package,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  ArrowUpRight,
  Power,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge as VerticalBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { FormSelect } from "./form-select";
import type { BusinessListItem } from "@/lib/admin/types";
import { toggleBusinessAction } from "@/app/admin/actions";
import { verticalConfig } from "@/lib/messaging/vertical-config";
import { Badge, Feedback, initialActionState } from "./shared";

function RowActions({ business }: { business: BusinessListItem }) {
  const [state, action, pending] = useActionState(
    toggleBusinessAction.bind(null, business.id, !business.active),
    initialActionState,
  );
  const href = `/admin/businesses/${encodeURIComponent(business.id)}`;
  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`Actions for ${business.name}`}
              >
                {pending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MoreHorizontal />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Business actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Business actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={href}>
              <ArrowUpRight />
              Open profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/business/${encodeURIComponent(business.id)}`}>
              <Package />
              Open workspace
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={pending}
            onSelect={() => startTransition(() => action(new FormData()))}
          >
            <Power />
            {business.active ? "Deactivate business" : "Activate business"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!state.ok && <Feedback state={state} />}
    </div>
  );
}

export function BusinessList({
  businesses,
}: {
  businesses: BusinessListItem[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [vertical, setVertical] = useState("all");
  const hasFilters = !!search || status !== "all" || vertical !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setVertical("all");
  };
  const filtered = businesses.filter(
    (business) =>
      `${business.name} ${business.id} ${business.vertical} ${business.whatsappPhoneNumberId}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === "all" || business.active === (status === "active")) &&
      (vertical === "all" || business.vertical === vertical),
  );
  const active = businesses.filter((business) => business.active).length;
  const stats = [
    {
      label: "Total businesses",
      value: businesses.length,
      detail: "Across all Tany verticals",
      icon: Building2,
    },
    {
      label: "Active businesses",
      value: active,
      detail: `${businesses.length - active} inactive`,
      icon: CircleCheck,
    },
    {
      label: "Catalog items",
      value: businesses.reduce(
        (count, business) => count + business.catalogCount,
        0,
      ),
      detail: "Products, services & inventory",
      icon: Package,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {stats.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} className="gap-0 p-4 shadow-none">
            <div className="flex items-center justify-between gap-4">
              <p className="min-h-8 text-xs font-medium text-muted-foreground sm:min-h-0">
                {label}
              </p>
              <Icon
                className="hidden size-4 shrink-0 text-muted-foreground sm:block"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {value}
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {detail}
              </p>
            </div>
          </Card>
        ))}
      </div>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative w-full sm:mr-auto sm:w-72">
            <Search
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search businesses"
              type="search"
              className="h-9 pl-9"
              placeholder="Search businesses..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <SlidersHorizontal
              className="hidden size-4 text-muted-foreground sm:block"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 sm:w-36">
              <FormSelect
                id="status-filter"
                name="status-filter"
                aria-label="Filter by status"
                value={status}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                onValueChange={setStatus}
              />
            </div>
            <div className="min-w-0 flex-1 sm:w-40">
              <FormSelect
                id="vertical-filter"
                name="vertical-filter"
                aria-label="Filter by vertical"
                value={vertical}
                options={[
                  { value: "all", label: "All verticals" },
                  ...Object.values(verticalConfig).map((entry) => ({
                    value: entry.key,
                    label: entry.label,
                  })),
                ]}
                onValueChange={setVertical}
              />
            </div>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search and filters"
              onClick={clearFilters}
            >
              <X />
            </Button>
          )}
        </div>
        {filtered.length ? (
          <Table className="min-w-[860px]">
            <TableCaption className="sr-only">
              Onboarded Tany businesses
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Business</TableHead>
                <TableHead scope="col">Vertical</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Plan / status</TableHead>
                <TableHead scope="col">WhatsApp phone ID</TableHead>
                <TableHead scope="col" className="text-right">
                  Items
                </TableHead>
                <TableHead scope="col" className="sticky right-0 w-12 border-l">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((business) => (
                <TableRow key={business.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <BrandLogo vertical={business.vertical} decorative />
                      <div className="min-w-0">
                        <Link
                          className="block max-w-64 truncate font-medium hover:underline"
                          href={`/business/${encodeURIComponent(business.id)}`}
                        >
                          {business.name}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {business.id}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <VerticalBadge
                      variant="secondary"
                      className="rounded-md font-normal"
                      style={{
                        backgroundColor: `var(--ground-tany${business.vertical})`,
                        color: `var(--logo-tany${business.vertical})`,
                      }}
                    >
                      {verticalConfig[business.vertical].label}
                    </VerticalBadge>
                  </TableCell>
                  <TableCell>
                    <Badge active={business.active} />
                  </TableCell>
                  <TableCell>
                    <p className="text-xs">
                      {typeof business.settings.plan === "string" &&
                      business.settings.plan
                        ? business.settings.plan
                        : "Not set"}
                    </p>
                    {typeof business.settings.subscriptionStatus === "string" &&
                      business.settings.subscriptionStatus && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {business.settings.subscriptionStatus}
                        </p>
                      )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {business.whatsappPhoneNumberId}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {business.catalogCount}
                  </TableCell>
                  <TableCell className="sticky right-0 border-l bg-background">
                    <RowActions business={business} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-muted/50">
              <Building2 className="size-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">
              {businesses.length
                ? "No businesses found"
                : "Add your first business"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {businesses.length
                ? "Try another search or adjust your filters."
                : "Manage profiles, WhatsApp connections and catalogs in one place."}
            </p>
            {businesses.length ? (
              <Button className="mt-4" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button asChild className="mt-4">
                <Link href="/admin/businesses/new">
                  <Plus />
                  New business
                </Link>
              </Button>
            )}
          </div>
        )}
        <div
          className="flex items-center justify-between gap-4 border-t px-4 py-3 text-xs text-muted-foreground"
          role="status"
        >
          <span>
            {filtered.length} of {businesses.length} businesses
          </span>
          <span className="hidden sm:block">All records shown</span>
        </div>
      </Card>
    </div>
  );
}
