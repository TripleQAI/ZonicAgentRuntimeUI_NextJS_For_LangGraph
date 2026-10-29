import { ChatView } from '@/components/chat/ChatView';

/** A conversation (task U5-03). The key remounts the view when the session changes. */
export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ChatView key={sessionId} sessionId={sessionId} />;
}
