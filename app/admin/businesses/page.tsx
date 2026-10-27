import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

import Link from "next/link";

import { Suspense } from "react";

import { connection } from "next/server";

import { listBusinesses } from "@/lib/admin/services";

import { BusinessList } from "@/app/admin/components/business-list";

import { LoadingPanel } from "@/app/admin/components/shared";

async function Directory() {
  await connection();

  const businesses = await listBusinesses();

  return <BusinessList businesses={businesses} />;
}

export default function BusinessesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Businesses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your businesses, profiles, and catalogs.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/businesses/new">
            <Plus />
            New business
          </Link>
        </Button>
      </div>
      <Suspense fallback={<LoadingPanel />}>
        <Directory />
      </Suspense>
    </div>
  );
}
