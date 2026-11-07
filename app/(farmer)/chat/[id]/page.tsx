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
  // Preferred lookup: the assistant reply the assessment explicitly produced.
  const byAssistantMessageId = new Map<number, Message["assessment"]>();
  // Legacy fallback for rows saved before the link existed.
  const byUserMessageId = new Map<number, Message["assessment"]>();
  for (const record of assessmentRecords) {
    try {
      const parsed = JSON.parse(
        record.structuredResult
      ) as Message["assessment"];
      if (record.assistantMessageId != null) {
        byAssistantMessageId.set(record.assistantMessageId, parsed);
      }
      byUserMessageId.set(record.messageId, parsed);
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
    if (message.role !== "assistant") return;

    // Attach the assessment that points directly at this reply. Older rows
    // fall back to the previous-message heuristic so existing data still
    // renders after the migration.
    const linked = byAssistantMessageId.get(message.id);
    if (linked) {
      message.assessment = linked;
      return;
    }
    const previous = rawMessages[index - 1];
    if (previous && byUserMessageId.has(previous.id)) {
      message.assessment = byUserMessageId.get(previous.id)!;
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
