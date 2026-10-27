import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge as StatusBadge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/admin/types";

export const initialActionState: ActionState = { ok: false, message: "" };
export function Badge({
  active,
  available = false,
}: {
  active: boolean;
  available?: boolean;
}) {
  return (
    <StatusBadge
      variant="secondary"
      className={`gap-1.5 rounded-md px-2 py-0.5 ${active ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${active ? "bg-success" : "bg-muted-foreground"}`}
      />
      {available
        ? active
          ? "Available"
          : "Unavailable"
        : active
          ? "Active"
          : "Inactive"}
    </StatusBadge>
  );
}
export function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <Alert
      role={state.ok ? "status" : "alert"}
      variant={state.ok ? "default" : "destructive"}
      className={
        state.ok
          ? "border-success/20 bg-success/10 text-success"
          : "border-destructive/20 bg-destructive/5"
      }
    >
      <AlertDescription className="text-inherit">
        <p>{state.message}</p>
        {state.errors && Object.keys(state.errors).length > 1 && (
          <ul className="mt-2 list-inside list-disc">
            {Object.entries(state.errors).map(([key, value]) => (
              <li key={key}>{value}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={name} className="mb-2 block">
        {label}
      </Label>
      {children}
      {hint && (
        <p
          id={`${name}-hint`}
          className="mt-2 text-xs leading-5 text-muted-foreground"
        >
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function LoadingPanel() {
  return (
    <div role="status" aria-label="Loading business data" className="space-y-6">
      <span className="sr-only">Loading business data...</span>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Card key={key} className="gap-3 p-4 shadow-none">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-16" />
          </Card>
        ))}
      </div>
      <Card className="gap-0 py-0 shadow-none">
        <div className="border-b p-4">
          <Skeleton className="h-9 w-full max-w-72" />
        </div>
        <div className="space-y-0 px-4">
          {[0, 1, 2, 3].map((key) => (
            <div
              key={key}
              className="flex items-center gap-4 border-b py-4 last:border-0"
            >
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2 w-20" />
              </div>
              <Skeleton className="h-5 w-16" />
              <Skeleton className="hidden h-3 w-24 sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
