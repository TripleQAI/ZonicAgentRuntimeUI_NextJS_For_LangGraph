import { RunTimeline } from '@/components/timeline/RunTimeline';

/** A run's timeline and trace (task U5-07). */
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunTimeline key={runId} runId={runId} />;
}
