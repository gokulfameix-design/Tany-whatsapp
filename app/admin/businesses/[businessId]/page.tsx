import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

import { Card } from "@/components/ui/card";

import Link from "next/link";

import { Suspense } from "react";

import { connection } from "next/server";

import { notFound } from "next/navigation";

import { getAdminBusiness } from "@/lib/admin/services";

import { Badge, LoadingPanel } from "@/app/admin/components/shared";

import { BusinessForm } from "@/app/admin/components/business-form";

import { getWorkspaceStats } from "@/lib/admin/workspace-service";
import { verticalConfig } from "@/lib/messaging/vertical-config";

async function Detail({ params }: { params: Promise<{ businessId: string }> }) {
  await connection();

  const { businessId } = await params;

  const business = await getAdminBusiness(businessId);

  if (!business) notFound();

  const stats = await getWorkspaceStats(businessId);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/businesses"
        className="inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Businesses
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <BrandLogo vertical={business.vertical} decorative />
            <h1 className="text-2xl font-semibold tracking-tight">
              {business.name}
            </h1>
            <Badge active={business.active} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {verticalConfig[business.vertical].label} ·{" "}
            <span className="font-mono">{business.id}</span>
          </p>
        </div>
        <Button asChild>
          <Link href={`/business/${encodeURIComponent(business.id)}`}>
            Open workspace →
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Object.entries(stats).map(([label, count]) => (
          <Card className="gap-0 p-4 shadow-none" key={label}>
            <p className="text-xs font-medium capitalize text-muted-foreground">
              {label === "catalog" ? "Catalog items" : label}
            </p>
            <p className="mt-2 text-xl font-semibold">{count}</p>
          </Card>
        ))}
      </div>
      <BusinessForm business={business} />
    </div>
  );
}

export default function BusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <Detail params={params} />
    </Suspense>
  );
}
