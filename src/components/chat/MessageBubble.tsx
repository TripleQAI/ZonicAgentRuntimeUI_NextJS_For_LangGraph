import { MessageContent } from '@/components/content/MessageContent';
import type { Message } from '@/lib/api/runtime';
import { t } from '@/lib/i18n/t';
import { MessageActions } from './MessageActions';

/** A saved chat message: the user's text in a bubble on the right, the agent's answer across the column. */
export function MessageBubble({ message, waitingRunId }: { message: Message; waitingRunId?: string }) {
  const user = message.role === 'user';
  return (
    <li className={`flex ${user ? 'justify-end' : 'justify-start'}`} data-message-id={message.messageId}>
      <article
        aria-label={user ? t('chat.you') : t('chat.agent')}
        className={user ? 'max-w-[85%] rounded-xl rounded-br-sm bg-raised px-4 py-2.5 md:max-w-[75%]' : 'w-full min-w-0 px-1'}
      >
        <MessageContent
          parts={message.contentParts}
          source={{
            ...(message.runId ? { runId: message.runId } : {}),
            sessionId: message.sessionId,
            answered: message.runId === undefined || message.runId !== waitingRunId,
          }}
        />
        {!user && <MessageActions message={message} />}
      </article>
    </li>
  );
}
