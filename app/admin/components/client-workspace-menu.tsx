"use client";
import Link from "next/link";
import { Check, ChevronsUpDown, LayoutDashboard, MessageCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
export function ClientWorkspaceMenu({ businessId, businessName, productUrl }: { businessId: string; businessName: string; productUrl: string }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-3"><MessageCircle className="size-5" /><span className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{businessName}</span><span className="block text-xs text-muted-foreground">WhatsApp Dashboard</span></span><ChevronsUpDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Switch workspace</DropdownMenuLabel><DropdownMenuItem asChild><a href={productUrl}><LayoutDashboard />Product Dashboard</a></DropdownMenuItem><DropdownMenuItem asChild><Link href={`/business/${encodeURIComponent(businessId)}`} aria-current="page"><MessageCircle />WhatsApp Dashboard<Check className="ml-auto" /></Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard/messaging/setup"><PlugZap />WhatsApp Setup</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
