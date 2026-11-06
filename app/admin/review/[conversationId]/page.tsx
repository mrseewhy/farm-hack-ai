import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { getAdminConversation } from "@/lib/data/actions/admin";
import { AdminShell } from "@/components/app/admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare, RotateCw } from "lucide-react";

type Image = {
  id: number;
  cloudinaryPublicId: string;
  secureUrl: string;
};

type Message = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  language: string;
  status: string;
  createdAt: Date;
  images: Image[];
};

type Assessment = {
  observedSigns: string[];
  possibleCauses: string[];
  followUpQuestions: string[];
  immediateActions: string[];
  whenToSeekHelp: string;
  uncertainty: { level: string; reason: string };
};

export default async function AdminReviewPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const id = Number(conversationId);

  if (!id) {
    redirect("/admin/dashboard");
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/chat");

  const conversation = await getAdminConversation(id);

  if (!conversation) {
    redirect("/admin/dashboard");
  }

  const messages: Message[] = (conversation.messages ?? []).map((m) => ({
    ...m,
    role: m.role as "user" | "assistant",
  }));

  const assessmentRecord = conversation.assessment;
  let parsedAssessment: Assessment | null = null;
  if (assessmentRecord) {
    try {
      parsedAssessment = JSON.parse(
        assessmentRecord.structuredResult
      ) as Assessment;
    } catch {
      parsedAssessment = null;
    }
  }

  return (
    <AdminShell
      title={`Conversation #${conversation.id}`}
      subtitle="Admin review of a farmer crop conversation."
    >
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/admin/dashboard"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex items-center gap-2"
          )}
        >
          <RotateCw className="size-4" /> Back to dashboard
        </Link>
      </div>

      <Card className="border-border/70 shadow-none mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            {conversation.title || "Untitled conversation"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Crop: {conversation.crop} &nbsp;·&nbsp; Updated:{" "}
            {new Date(conversation.updatedAt).toLocaleString()}
          </p>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            {messages.length} message(s) in this conversation.
          </p>
        </CardContent>
      </Card>

      {parsedAssessment && (
        <Card className="border-border/70 shadow-none mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Crop assessment</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {parsedAssessment.observedSigns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-primary mb-1">
                  Observed signs
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  {parsedAssessment.observedSigns.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsedAssessment.possibleCauses.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-primary mb-1">
                  Possible causes
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  {parsedAssessment.possibleCauses.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsedAssessment.immediateActions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-primary mb-1">
                  Suggested actions
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  {parsedAssessment.immediateActions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsedAssessment.whenToSeekHelp && (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold">When to seek help:</span>{" "}
                {parsedAssessment.whenToSeekHelp}
              </p>
            )}
            {parsedAssessment.uncertainty && (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold">Uncertainty:</span>{" "}
                {parsedAssessment.uncertainty.level} —{" "}
                {parsedAssessment.uncertainty.reason}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Messages</CardTitle>
          <p className="text-sm text-muted-foreground">
            Conversation history (read-only)
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-4 p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No messages yet.
              </p>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                      message.role === "user"
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tl-sm bg-muted text-muted-foreground"
                    )}
                  >
                    {message.images.length > 0 && (
                      <div className="mb-3 flex gap-2">
                        {message.images.map((img) => (
                          <img
                            key={img.id}
                            src={img.secureUrl}
                            alt="Crop photo attached to message"
                            className="h-24 w-32 rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {message.role} &nbsp;·&nbsp;{" "}
                      {new Date(message.createdAt).toLocaleString()} &nbsp;·&nbsp;
                      {message.language}
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Link
          href="/admin/dashboard"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center gap-2")}
        >
          <MessageSquare className="size-4" /> Back to dashboard
        </Link>
      </div>
    </AdminShell>
  );
}
