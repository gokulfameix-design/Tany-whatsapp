"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { verticalConfig } from "@/lib/messaging/vertical-config";
import type { AdminBusiness, WorkspaceOption } from "@/lib/admin/types";

function WorkspaceLabel({
  business,
  loading = false,
}: {
  business?: AdminBusiness;
  loading?: boolean;
}) {
  return (
    <>
      <BrandLogo vertical={business?.vertical} decorative />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium">
          {business?.name ?? "Tany Messaging"}
        </span>
        {loading ? (
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
            <Skeleton className="h-2 w-3" />
            Loading workspaces...
          </span>
        ) : (
          <span className="block truncate text-[11px] font-normal text-muted-foreground">
            {business
              ? `${verticalConfig[business.vertical].label}${business.active ? "" : " · Inactive"}`
              : "Super Admin"}
          </span>
        )}
      </span>
      <ChevronsUpDown
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </>
  );
}
export function WorkspaceSwitcherLoading({
  business,
}: {
  business?: AdminBusiness;
}) {
  return (
    <Button
      variant="ghost"
      disabled
      aria-busy="true"
      className="h-auto w-full justify-start gap-3 px-2 py-2"
    >
      <WorkspaceLabel business={business} loading />
    </Button>
  );
}
export function WorkspaceMenu({
  business,
  options,
  failed = false,
  canSeeAdmin = true,
}: {
  business?: AdminBusiness;
  options: WorkspaceOption[];
  failed?: boolean;
  canSeeAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  // An inactive current workspace stays visible, but is never a switch destination.
  const currentInactive = business && !business.active ? business : null;
  const query = search.trim().toLowerCase();
  const products = Object.values(verticalConfig)
    .map(({ key, label }) => {
      const matchesProduct = `${key} ${label}`.toLowerCase().includes(query);
      const workspaces = options.filter(
        (option) =>
          option.active &&
          option.vertical === key &&
          (matchesProduct ||
            `${option.name} ${option.id}`.toLowerCase().includes(query)),
      );
      return { key, label, workspaces, matchesProduct };
    })
    .filter(
      (product) => product.matchesProduct || product.workspaces.length > 0,
    )
    .sort(
      (a, b) =>
        Number(b.workspaces.length > 0) - Number(a.workspaces.length > 0),
    );
  const close = () => {
    setOpen(false);
    setOpenMobile(false);
  };
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-3 px-2 py-2"
          aria-label={`Switch workspace. Current: ${business?.name ?? "Tany Messaging"}`}
        >
          <WorkspaceLabel business={business} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        side="bottom"
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-1"
      >
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Switch workspace
        </DropdownMenuLabel>
        {canSeeAdmin && (
          <DropdownMenuItem
            asChild
            className={!business ? "bg-muted" : undefined}
          >
            <Link
              href="/admin"
              onClick={close}
              aria-current={!business ? "true" : undefined}
            >
              <BrandLogo decorative />
              <span className="flex-1 text-xs font-medium">Tany Messaging</span>
              {!business && (
                <Check className="size-4" aria-label="Current workspace" />
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {
          <div className="relative p-1">
            <Search
              className="pointer-events-none absolute top-3.5 left-3 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search workspaces"
              placeholder="Search businesses or verticals..."
              className="h-8 pl-8 text-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" && event.key !== "Tab")
                  event.stopPropagation();
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  contentRef.current
                    ?.querySelector<HTMLElement>(
                      '[role="menuitem"]:not([data-disabled])',
                    )
                    ?.focus();
                }
              }}
            />
          </div>
        }
        <div className="max-h-72 overflow-y-auto overscroll-contain">
          {products.map((product) =>
            product.workspaces.length ? (
              product.workspaces.map((option) => (
                <DropdownMenuItem
                  asChild
                  key={option.id}
                  className={
                    business?.id === option.id ? "bg-muted" : undefined
                  }
                >
                  <Link
                    href={`/business/${encodeURIComponent(option.id)}`}
                    onClick={close}
                    aria-current={
                      business?.id === option.id ? "true" : undefined
                    }
                  >
                    <BrandLogo vertical={product.key} decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {product.label}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {option.name}
                      </span>
                    </span>
                    {business?.id === option.id && (
                      <Check
                        className="size-4 shrink-0"
                        aria-label="Current workspace"
                      />
                    )}
                  </Link>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem
                key={product.key}
                disabled
                className="data-disabled:pointer-events-auto data-disabled:cursor-not-allowed data-disabled:opacity-50"
              >
                <BrandLogo vertical={product.key} decorative />
                <span className="min-w-0 flex-1 text-xs font-medium">
                  {product.label}
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] font-normal"
                >
                  {failed ? "Unavailable" : "Coming Soon"}
                </Badge>
              </DropdownMenuItem>
            ),
          )}
          {currentInactive && (
            <DropdownMenuItem disabled className="bg-muted">
              <BrandLogo vertical={currentInactive.vertical} decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {currentInactive.name}
                </span>
                <span className="block text-[10px]">
                  {verticalConfig[currentInactive.vertical].label}
                </span>
              </span>
              <Badge variant="outline" className="text-[10px]">
                Inactive
              </Badge>
              <Check className="size-4" aria-label="Current workspace" />
            </DropdownMenuItem>
          )}
          {failed ? (
            <div
              role="alert"
              className="space-y-2 px-3 py-3 text-xs text-muted-foreground"
            >
              <p>Could not load workspaces.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            !products.length && (
              <p
                role="status"
                className="px-3 py-4 text-center text-xs text-muted-foreground"
              >
                {search
                  ? "No matching products or businesses."
                  : "No products found."}
              </p>
            )
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
