import { NewChat } from '@/components/catalog/NewChat';

/** The agent catalog and new-chat composer (task U5-01); `?agent=<id>` preselects an agent. */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  return <NewChat initialAgentId={agent} />;
}
