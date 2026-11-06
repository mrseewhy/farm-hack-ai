import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConversation } from "@/lib/data/actions";
import { ChatScreen } from "@/components/app/chat-screen";
import type { Message } from "@/components/app/chat-screen";

export default async function SavedChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conversationId = Number(id);

  if (!conversationId) {
    redirect("/chat");
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");

  const conversation = await getConversation(conversationId);

  if (!conversation) {
    redirect("/chat");
  }

  // Parse every stored assessment for this conversation so structured results
  // for all turns are restored on reload, not just the latest one.
  const assessmentRecords = conversation.assessments ?? [];
  const parsedAssessments = new Map<number, Message["assessment"]>();
  for (const record of assessmentRecords) {
    try {
      parsedAssessments.set(
        record.messageId,
        JSON.parse(record.structuredResult) as Message["assessment"]
      );
    } catch {
      // Skip malformed records.
    }
  }

  const messages: Message[] = [];
  const rawMessages = conversation.messages ?? [];
  rawMessages.forEach((m, index) => {
    const message = {
      ...m,
      role: m.role as "user" | "assistant",
    } as Message;
    messages.push(message);
    // Attach each saved assessment to the assistant reply that answered the
    // assessed user message (identified by assessment.messageId). This keeps
    // the structured sections aligned with the correct reply in longer chats.
    if (
      message.role === "assistant" &&
      index > 0 &&
      parsedAssessments.has(rawMessages[index - 1]?.id)
    ) {
      message.assessment = parsedAssessments.get(rawMessages[index - 1]!.id)!;
    }
  });

  const initialConversation = {
    id: conversation.id,
    userId: conversation.userId,
    title: conversation.title,
    crop: conversation.crop,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages,
    assessment: null,
  };

  return <ChatScreen
    initialLanguage={session.user.preferredLanguage}
    conversationId={conversationId}
    initialConversation={initialConversation}
  />;
}
