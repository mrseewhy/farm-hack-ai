import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { ArrowRight, BookOpen, CircleHelp, MessageSquare, Sprout, Users } from "lucide-react";
import { AdminShell } from "@/components/app/admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const metrics = [
  { label: "Farmers", icon: Users },
  { label: "Conversations", icon: MessageSquare },
  { label: "Crop reports", icon: Sprout },
  { label: "Needs review", icon: CircleHelp },
];
export default async function AdminDashboard() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/chat");
  return <AdminShell title="Dashboard" subtitle="A clear view of crop conversations and guidance quality."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, icon: Icon }) => <Card key={label} className="border-border/70 shadow-none"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-4 text-3xl font-semibold">—</p><p className="mt-1 text-xs text-muted-foreground">No data yet</p></div><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}</div><div className="mt-7 grid gap-5 lg:grid-cols-[1.5fr_1fr]"><Card className="border-border/70 shadow-none"><CardHeader><CardTitle className="text-lg">Review queue</CardTitle><p className="text-sm text-muted-foreground">Assessments needing a human check will appear here.</p></CardHeader><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><CircleHelp className="mb-3 size-7 text-muted-foreground/60" /><p className="font-medium">No reports to review yet</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Once farmers start using the crop checker, flagged assessments will be listed here.</p></CardContent></Card><Card className="border-border/70 shadow-none"><CardHeader><CardTitle className="text-lg">Crop guidance</CardTitle><p className="text-sm text-muted-foreground">Keep farmer-facing advice accurate and reviewed.</p></CardHeader><CardContent><div className="rounded-xl bg-primary/5 p-5"><BookOpen className="mb-4 size-6 text-primary" /><p className="font-medium">Start with tomato guidance</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Document signs, follow-up questions, safe actions, and reviewer notes.</p><Link href="/admin/guidance" className={cn(buttonVariants({ variant: "outline" }), "mt-5")}>View guidance<ArrowRight className="size-4" /></Link></div></CardContent></Card></div></AdminShell>;
}
