import { requireDashboardAccess } from "@/lib/admin/dashboard-session";
import { OperationsPage } from "@/app/admin/components/operations-page";
import { operationSections } from "@/lib/admin/operations-types";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { loadBusiness } from "@/app/business/_components/load-business";
import { RecordTable } from "@/app/business/_components/record-table";
import {
  listWorkspaceRecords,
  isWorkspaceCollection,
} from "@/lib/admin/workspace-service";
import { listCatalog } from "@/lib/admin/services";
import { CatalogPanel } from "@/app/admin/components/catalog-panel";
import { BusinessForm } from "@/app/admin/components/business-form";
import { LoadingPanel } from "@/app/admin/components/shared";

async function Section({
  params,
}: {
  params: Promise<{ businessId: string; section: string }>;
}) {
  await connection();
  const { businessId, section } = await params;
  if (operationSections.some((value) => value === section)) {
    await loadBusiness(businessId);
    return (
      <OperationsPage
        businessId={businessId}
        section={section as (typeof operationSections)[number]}
      />
    );
  }
  await requireDashboardAccess();
  if (
    section !== "catalog" &&
    section !== "settings" &&
    !isWorkspaceCollection(section)
  )
    notFound();
  const business = await loadBusiness(businessId);
  const title = section[0].toUpperCase() + section.slice(1);
  const content =
    section === "catalog" ? (
      <CatalogPanel
        key={business.id}
        business={business}
        items={await listCatalog(businessId)}
      />
    ) : section === "settings" ? (
      <BusinessForm key={business.id} business={business} showPlan={false} />
    ) : (
      <RecordTable
        key={`${business.id}/${section}`}
        section={section}
        records={await listWorkspaceRecords(businessId, section)}
      />
    );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {section === "catalog"
            ? "Products, services and inventory"
            : section === "settings"
              ? "Business profile and messaging settings"
              : `View ${section}`}{" "}
          for {business.name}.
        </p>
      </div>
      {content}
    </div>
  );
}
export default function BusinessSection(props: {
  params: Promise<{ businessId: string; section: string }>;
}) {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <Section {...props} />
    </Suspense>
  );
}
