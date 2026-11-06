import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChatScreen } from "@/components/app/chat-screen";

export default async function ChatPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");
  return <ChatScreen initialLanguage={session.user.preferredLanguage} />;
}
