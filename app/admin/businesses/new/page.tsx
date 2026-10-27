import Link from "next/link";

import { BusinessForm } from "@/app/admin/components/business-form";

export default function NewBusinessPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin/businesses"
        className="inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Businesses
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New business</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a business profile. You can add its catalog next.
        </p>
      </div>
      <BusinessForm />
    </div>
  );
}
