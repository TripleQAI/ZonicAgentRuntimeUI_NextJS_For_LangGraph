import type {
  CardPart,
  ChartPart,
  CitationPart,
  ContentPartData,
  ErrorPart,
  FilePart,
  FormPart,
  GridPart,
  HtmlPart,
  InterruptRequestedData,
  JsonPart,
  LoopIterationData,
  MarkdownPart,
  NodeFinishedData,
  NodeStartedData,
  RunCancelledData,
  RunCompletedData,
  RunEvent,
  RunFailedData,
  RunStartedData,
  RunWaitingData,
  StateUpdatedData,
  StreamGapData,
  SwarmHandoffData,
  SwarmMemberData,
  TablePart,
  TextDeltaData,
  ToolFinishedData,
  ToolStartedData,
  WarningData,
} from './generated/models';

/**
 * The typed forms of the generated contract: the server's class models type each event's `data`
 * and each content part, but the envelope's `data` and a message's `contentParts` are plain objects
 * in the JSON Schemas. These unions pair them up; the types themselves stay generated (case U-14).
 */

/** A content part (design Section 12.5), discriminated by `type`. */
export type ContentPart =
  | MarkdownPart
  | TablePart
  | GridPart
  | ChartPart
  | CardPart
  | JsonPart
  | FilePart
  | HtmlPart
  | CitationPart
  | ErrorPart
  | FormPart;

export type ContentPartType = ContentPart['type'];

/** The data model of each event type (design Section 12.4). */
export interface RunEventData {
  'run.started': RunStartedData;
  'node.started': NodeStartedData;
  'node.finished': NodeFinishedData;
  'token.delta': TextDeltaData;
  'reasoning.delta': TextDeltaData;
  'tool.started': ToolStartedData;
  'tool.finished': ToolFinishedData;
  'swarm.member.started': SwarmMemberData;
  'swarm.member.finished': SwarmMemberData;
  'swarm.handoff': SwarmHandoffData;
  'loop.iteration': LoopIterationData;
  'content.part': ContentPartData;
  'state.updated': StateUpdatedData;
  'interrupt.requested': InterruptRequestedData;
  warning: WarningData;
  'run.waiting': RunWaitingData;
  'run.completed': RunCompletedData;
  'run.failed': RunFailedData;
  'run.cancelled': RunCancelledData;
  'stream.gap': StreamGapData;
  heartbeat: Record<string, never>;
}

export type RunEventType = RunEvent['type'];

/** A run event with its data typed by `type`. */
export type TypedRunEvent = {
  [K in RunEventType]: Omit<RunEvent, 'type' | 'data'> & { type: K; data: RunEventData[K] };
}[RunEventType];

export type EventOf<K extends RunEventType> = Extract<TypedRunEvent, { type: K }>;

/** Events after which the turn's stream ends: the run finished or waits for input. */
export const TURN_END_EVENTS: ReadonlySet<RunEventType> = new Set([
  'run.completed',
  'run.failed',
  'run.cancelled',
  'run.waiting',
]);

/** Run statuses after which nothing more happens (the run row's terminal states). */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['succeeded', 'failed', 'cancelled', 'timed_out']);

const PART_TYPES: ReadonlySet<string> = new Set<ContentPartType>([
  'markdown',
  'table',
  'grid',
  'chart',
  'card',
  'json',
  'file',
  'html',
  'citation',
  'error',
  'form',
]);

/** A message's or event's part as a typed part; anything else is shown as JSON. */
export function asContentPart(value: unknown): ContentPart {
  if (typeof value === 'object' && value !== null && PART_TYPES.has(String((value as { type?: unknown }).type)))
    return value as ContentPart;
  return { type: 'json', value };
}
