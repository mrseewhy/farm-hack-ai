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

  const initialConversation = {
    id: conversation.id,
    userId: conversation.userId,
    title: conversation.title,
    crop: conversation.crop,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: (conversation.messages ?? []).map((m) => ({
      ...m,
      role: m.role as "user" | "assistant",
    })) as Message[],
    assessment: conversation.assessment,
  };

  return <ChatScreen
    initialLanguage={session.user.preferredLanguage}
    conversationId={conversationId}
    initialConversation={initialConversation}
  />;
}
