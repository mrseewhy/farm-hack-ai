import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  MessageSquare,
  Sprout,
  Users,
  AlertTriangle,
} from "lucide-react";
import { AdminShell } from "@/components/app/admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAdminOverview,
  getReviewQueue,
} from "@/lib/data/actions";

const metrics = [
  { label: "Farmers", icon: Users },
  { label: "Conversations", icon: MessageSquare },
  { label: "Crop reports", icon: Sprout },
  { label: "Needs review", icon: CircleHelp },
];

export default async function AdminDashboard() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/chat");

  type ReviewQueueItem = {
    id: number;
    conversationId: number;
    messageId: number;
    uncertainty: { level: string; reason: string };
    observedSigns: string[];
    possibleCauses: string[];
    createdAt: Date;
    model: string;
  };

  // Use Promise.allSettled so a database outage does not silently render as
  // false zeros (which would look like an unused app). Errors are surfaced
  // instead of being swallowed into empty data.
  const [overviewResult, reviewQueueResult] = await Promise.allSettled([
    getAdminOverview(),
    getReviewQueue(),
  ]);

  let overview = { farmers: 0, conversations: 0, cropReports: 0, needsReview: 0 };
  let overviewError: string | null = null;
  if (overviewResult.status === "fulfilled") {
    overview = overviewResult.value;
  } else {
    overviewError =
      overviewResult.reason instanceof Error
        ? overviewResult.reason.message
        : "Failed to load overview metrics.";
    console.error("Admin overview failed:", overviewResult.reason);
  }

  let reviewQueue: ReviewQueueItem[] = [];
  let reviewQueueError: string | null = null;
  if (reviewQueueResult.status === "fulfilled") {
    reviewQueue = reviewQueueResult.value;
  } else {
    reviewQueueError =
      reviewQueueResult.reason instanceof Error
        ? reviewQueueResult.reason.message
        : "Failed to load review queue.";
    console.error("Review queue failed:", reviewQueueResult.reason);
  }

  const dashboardError = overviewError ?? reviewQueueError;

  return (
    <AdminShell
      title="Dashboard"
      subtitle="A clear view of crop conversations and guidance quality."
    >
      {dashboardError && (
        <div className="mb-6 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          <p className="font-semibold">Data unavailable</p>
          <p className="mt-1">
            {dashboardError}. The metrics below may show stale or zero values
            because of a database error; this does not necessarily mean the app
            is unused.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, icon: Icon }) => {
          const valueMap: Record<string, number> = {
            Farmers: overview.farmers,
            Conversations: overview.conversations,
            "Crop reports": overview.cropReports,
            "Needs review": overview.needsReview,
          };
          const value = valueMap[label] ?? 0;
          const isEmpty = value === 0;
          return (
            <Card
              key={label}
              className="border-border/70 shadow-none"
            >
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-4 text-3xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isEmpty ? "No data yet" : "Last updated just now"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-xl p-2.5",
                    value > 0
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Icon className="size-5" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg">Review queue</CardTitle>
            <p className="text-sm text-muted-foreground">
              Assessments needing a human check
            </p>
          </CardHeader>
          <CardContent className="p-4">
            {reviewQueue.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center text-center">
                <CircleHelp className="mb-3 size-7 text-muted-foreground/60" />
                <p className="font-medium">No reports to review yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Once farmers start using the crop checker, flagged assessments will be listed here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reviewQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className="size-4 text-destructive"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-semibold text-destructive">
                        High uncertainty
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground truncate">
                        Conversation {item.conversationId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.possibleCauses.slice(0, 3).join(", ")}
                        {item.possibleCauses.length > 3 && "…"}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        <Link
                          href={`/admin/review/${item.conversationId}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "text-xs"
                          )}
                        >
                          View report
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Crop guidance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Keep farmer-facing advice accurate and reviewed.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl bg-primary/5 p-5">
              <BookOpen className="mb-4 size-6 text-primary" />
              <p className="font-medium">Start with tomato guidance</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Document signs, follow-up questions, safe actions, and reviewer notes.
              </p>
              <Link
                href="/admin/guidance"
                className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
              >
                View guidance
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
