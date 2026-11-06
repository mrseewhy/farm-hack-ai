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

  // Parse the stored assessment and attach it to the assistant message so the
  // structured observation/cause/action sections render after a reload.
  const assessmentRecord = conversation.assessment;
  let parsedAssessment: Message["assessment"] | null = null;
  if (assessmentRecord) {
    try {
      parsedAssessment = JSON.parse(
        assessmentRecord.structuredResult
      ) as Message["assessment"];
    } catch {
      parsedAssessment = null;
    }
  }

  const messages: Message[] = [];
  let lastAssistantIndex = -1;
  (conversation.messages ?? []).forEach((m) => {
    const message = {
      ...m,
      role: m.role as "user" | "assistant",
    } as Message;
    if (message.role === "assistant") {
      lastAssistantIndex = messages.length;
    }
    messages.push(message);
  });
  if (lastAssistantIndex !== -1 && parsedAssessment) {
    messages[lastAssistantIndex].assessment = parsedAssessment;
  }

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
