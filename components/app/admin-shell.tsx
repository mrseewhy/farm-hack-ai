"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, Menu, Settings } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AdminShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const path = usePathname();
  const nav = <div className="flex h-full flex-col"><div className="border-b px-5 py-5"><Brand href="/admin/dashboard" /><p className="mt-2 pl-11 text-xs font-medium text-muted-foreground">Admin workspace</p></div><nav aria-label="Admin navigation" className="flex-1 space-y-1 px-3 py-6"><Link href="/admin/dashboard" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${path === "/admin/dashboard" ? "bg-sidebar-accent font-semibold text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}><LayoutDashboard className="size-4" />Dashboard</Link><Link href="/admin/guidance" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${path === "/admin/guidance" ? "bg-sidebar-accent font-semibold text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}><BookOpen className="size-4" />Crop guidance</Link></nav><div className="border-t px-4 py-4"><div className="flex items-center justify-between"><Link href="/profile" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><Settings className="size-4" />Profile & settings</Link><ThemeToggle /></div><Link href="/login" className="mt-2 block text-sm text-muted-foreground hover:text-foreground">Sign in</Link></div></div>;
  return <div className="flex min-h-dvh bg-background"><aside className="hidden w-[252px] shrink-0 border-r bg-sidebar md:block">{nav}</aside><div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b px-5 sm:px-8"><div className="flex items-center gap-3"><Sheet><SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open admin navigation" />}><Menu className="size-5" /></SheetTrigger><SheetContent side="left" className="w-[270px] p-0"><SheetTitle className="sr-only">Admin navigation</SheetTitle>{nav}</SheetContent></Sheet><span className="text-sm font-medium">Admin workspace</span></div><span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Admin</span></header><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div className="mb-8"><p className="mb-2 text-sm font-medium text-primary">FarmHack AI / Admin</p><h1 className="text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{subtitle}</p></div>{children}</main></div></div>;
}
