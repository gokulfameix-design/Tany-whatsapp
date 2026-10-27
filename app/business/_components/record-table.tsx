"use client";

import { useState } from "react";
import { Search, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  WorkspaceCollection,
  WorkspaceRecord,
} from "@/lib/admin/workspace-service";

export function displayDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not recorded";
}
const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    amount,
  );

export function RecordTable({
  records,
  section,
}: {
  records: WorkspaceRecord[];
  section: WorkspaceCollection;
}) {
  const [search, setSearch] = useState("");
  const filtered = records.filter((record) =>
    [record.id, record.title, record.description, record.phone, record.status]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const monetary = section === "orders" || section === "bookings";
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex items-center justify-between gap-4 border-b p-4">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={`Search ${section}`}
            placeholder={`Search ${section}...`}
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-md font-normal">
          Read only
        </Badge>
      </div>
      {filtered.length ? (
        <Table className="min-w-[720px]">
          <TableCaption className="sr-only">
            Business-scoped {section}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>
                {section === "customers"
                  ? "Customer"
                  : section === "conversations"
                    ? "Conversation"
                    : section === "bookings"
                      ? "Service"
                      : "Order"}
              </TableHead>
              <TableHead>Phone</TableHead>
              {section !== "customers" && <TableHead>Status</TableHead>}
              {section === "bookings" && <TableHead>Scheduled for</TableHead>}
              {monetary && <TableHead className="text-right">Amount</TableHead>}
              <TableHead>Last updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="max-w-80">
                  <p className="truncate font-medium">{record.title}</p>
                  <p
                    className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                    title={record.id}
                  >
                    {record.id}
                  </p>
                  {record.description && (
                    <p
                      className="mt-1 truncate text-xs text-muted-foreground"
                      title={record.description}
                    >
                      {record.description}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {record.phone || "Not recorded"}
                </TableCell>
                {section !== "customers" && (
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="rounded-md font-normal"
                    >
                      {record.status.replaceAll("_", " ") || "Not recorded"}
                    </Badge>
                  </TableCell>
                )}
                {section === "bookings" && (
                  <TableCell>
                    {record.scheduledFor || "Not scheduled"}
                  </TableCell>
                )}
                {monetary && (
                  <TableCell className="text-right tabular-nums">
                    {record.amount === null
                      ? "Not recorded"
                      : money(record.amount)}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {displayDate(record.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <div className="mb-4 rounded-xl border bg-muted/50 p-3">
            <Inbox className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-sm font-semibold">
            {search ? "No matching records" : `No ${section} yet`}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {search
              ? "Try a different name, phone, or status."
              : "Records from this business's messaging flows will appear here."}
          </p>
          {search && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setSearch("")}
            >
              Clear search
            </Button>
          )}
        </div>
      )}
      <div
        className="border-t px-4 py-3 text-xs text-muted-foreground"
        role="status"
      >
        {filtered.length} of {records.length} records
      </div>
    </Card>
  );
}
