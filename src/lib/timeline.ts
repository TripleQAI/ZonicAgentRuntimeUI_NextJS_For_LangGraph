import type { NodeFinishedData } from '@/lib/api/generated/models';
import type { TimelineEntry } from '@/lib/api/runtime';
import type { TypedRunEvent } from '@/lib/api/types';

/** One step of a run's timeline (task U5-07): node visits, tool calls, swarm members and handoffs. */
export type Step =
  | {
      kind: 'node';
      id: string;
      nodeId: string;
      name: string;
      nodeType: string;
      visit: number;
      path?: string;
      status: 'running' | NodeFinishedData['status'];
      durationMs?: number;
      handles?: string[];
      errorCode?: string;
    }
  | {
      kind: 'tool';
      id: string;
      toolUseId: string;
      name: string;
      nodeId?: string;
      member?: string;
      status: 'running' | 'success' | 'error';
      durationMs?: number;
    }
  | {
      kind: 'member';
      id: string;
      member: string;
      nodeId?: string;
      status: string;
      durationMs?: number;
    }
  | { kind: 'handoff'; id: string; from: string; to: string[]; message?: string; nodeId?: string }
  | { kind: 'loop'; id: string; loopId: string; iteration: number; nodeId?: string }
  | { kind: 'interrupt'; id: string; interruptId: string; prompt?: string; nodeId?: string }
  | { kind: 'warning'; id: string; code: string; message: string; nodeId?: string };

/** Events the timeline keeps; token and state events are left out to bound memory. */
export const TIMELINE_EVENTS: ReadonlySet<TypedRunEvent['type']> = new Set([
  'node.started',
  'node.finished',
  'tool.started',
  'tool.finished',
  'swarm.member.started',
  'swarm.member.finished',
  'swarm.handoff',
  'loop.iteration',
  'interrupt.requested',
  'warning',
]);

const nodeKey = (event: TypedRunEvent) => `${event.path ?? ''}/${event.nodeId ?? ''}`;

/** The steps of a run in event order: each `*.finished` completes the step its `*.started` opened. */
export function stepsFromEvents(events: readonly TypedRunEvent[]): Step[] {
  const steps: Step[] = [];
  const update = <S extends Step>(match: (step: Step) => step is S, change: (step: S) => S) => {
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index]!;
      if (match(step)) {
        steps[index] = change(step);
        return true;
      }
    }
    return false;
  };
  for (const event of events) {
    const id = `${event.runId}:${event.seq}`;
    switch (event.type) {
      case 'node.started':
        steps.push({
          kind: 'node',
          id,
          nodeId: event.nodeId ?? '',
          name: event.data.nodeName,
          nodeType: event.data.nodeType,
          visit: event.data.visit,
          ...(event.path ? { path: event.path } : {}),
          status: 'running',
        });
        break;
      case 'node.finished': {
        const key = nodeKey(event);
        update(
          (step): step is Extract<Step, { kind: 'node' }> =>
            step.kind === 'node' && step.status === 'running' && `${step.path ?? ''}/${step.nodeId}` === key,
          (step) => ({
            ...step,
            status: event.data.status,
            durationMs: event.data.durationMs,
            handles: event.data.handles,
            ...(event.data.errorCode ? { errorCode: event.data.errorCode } : {}),
          }),
        );
        break;
      }
      case 'tool.started':
        steps.push({
          kind: 'tool',
          id,
          toolUseId: event.data.toolUseId,
          name: event.data.toolName,
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
          ...(event.data.member ? { member: event.data.member } : {}),
          status: 'running',
        });
        break;
      case 'tool.finished':
        update(
          (step): step is Extract<Step, { kind: 'tool' }> =>
            step.kind === 'tool' && step.toolUseId === event.data.toolUseId,
          (step) => ({
            ...step,
            status: event.data.status,
            ...(event.data.durationMs != null ? { durationMs: event.data.durationMs } : {}),
          }),
        );
        break;
      case 'swarm.member.started':
        steps.push({
          kind: 'member',
          id,
          member: event.data.member,
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
          status: 'running',
        });
        break;
      case 'swarm.member.finished':
        if (
          !update(
            (step): step is Extract<Step, { kind: 'member' }> =>
              step.kind === 'member' && step.member === event.data.member && step.status === 'running',
            (step) => ({
              ...step,
              status: event.data.status ?? 'completed',
              ...(event.data.durationMs != null ? { durationMs: event.data.durationMs } : {}),
            }),
          )
        )
          steps.push({
            kind: 'member',
            id,
            member: event.data.member,
            ...(event.nodeId ? { nodeId: event.nodeId } : {}),
            status: event.data.status ?? 'completed',
            ...(event.data.durationMs != null ? { durationMs: event.data.durationMs } : {}),
          });
        break;
      case 'swarm.handoff':
        steps.push({
          kind: 'handoff',
          id,
          from: event.data.from,
          to: event.data.to ?? [],
          ...(event.data.message ? { message: event.data.message } : {}),
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
        });
        break;
      case 'loop.iteration':
        steps.push({
          kind: 'loop',
          id,
          loopId: event.data.loopId,
          iteration: event.data.iteration,
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
        });
        break;
      case 'interrupt.requested':
        steps.push({
          kind: 'interrupt',
          id,
          interruptId: event.data.interruptId,
          ...(event.data.prompt ? { prompt: event.data.prompt } : {}),
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
        });
        break;
      case 'warning':
        steps.push({
          kind: 'warning',
          id,
          code: event.data.code,
          message: event.data.message ?? event.data.code,
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
        });
        break;
      default:
        break;
    }
  }
  return steps;
}

/**
 * The steps of a finished run from its saved node timeline, when its events are gone. The LangGraph
 * runtime's timeline names no node, so the node ID stands in for its name.
 */
export function stepsFromVisits(visits: readonly TimelineEntry[]): Step[] {
  return visits.map((visit) => ({
    kind: 'node',
    id: `${visit.nodeId}#${visit.visit}`,
    nodeId: visit.nodeId,
    name: visit.nodeId,
    nodeType: visit.nodeType,
    visit: visit.visit,
    ...(visit.path ? { path: visit.path } : {}),
    status: visit.status,
    durationMs: visit.durationMs,
    handles: visit.handles,
    ...(visit.errorCode ? { errorCode: visit.errorCode } : {}),
  }));
}
