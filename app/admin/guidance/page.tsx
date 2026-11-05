import { BookOpen } from "lucide-react";
import { AdminShell } from "@/components/app/admin-shell";
import { Card, CardContent } from "@/components/ui/card";

export default function GuidancePage() {
  return <AdminShell title="Crop guidance" subtitle="Reviewed knowledge for clear, cautious farmer advice."><Card className="border-dashed shadow-none"><CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><span className="mb-4 rounded-2xl bg-primary/10 p-4 text-primary"><BookOpen className="size-7" /></span><h2 className="text-lg font-semibold">No guidance articles yet</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Create and review crop guidance before it is used in farmer advice.</p><div className="mt-6 flex gap-2 text-xs"><span className="rounded-full bg-muted px-3 py-1">Draft</span><span className="rounded-full bg-muted px-3 py-1">In review</span><span className="rounded-full bg-muted px-3 py-1">Published</span></div></CardContent></Card></AdminShell>;
}
