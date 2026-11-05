import { ChatScreen } from "@/components/app/chat-screen";
export default async function SavedChatPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ChatScreen initialId={id} />; }
