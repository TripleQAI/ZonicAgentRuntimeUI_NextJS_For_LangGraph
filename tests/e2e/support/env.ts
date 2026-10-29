import fs from 'node:fs';
import path from 'node:path';

export type Target = 'fakes' | 'dev' | 'local';

/** Which run of the suite this is (playwright.config.ts sets it for the workers). */
export const target = (): Target =>
  process.env.E2E_TARGET === 'dev' || process.env.E2E_TARGET === 'local' ? process.env.E2E_TARGET : 'fakes';

export const AUTH_DIR = path.resolve('tests/e2e/.auth');

/** The test users: their storage state (session cookie) files. */
export const USERS = ['e2e-alice', 'e2e-bob', 'e2e-carol', 'e2e-dave'] as const;
export type User = (typeof USERS)[number];
export const storageFor = (user: User) => path.join(AUTH_DIR, `${target() === 'dev' ? 'dev' : user}.json`);

/** A dev (or local) agent: its workflow ID and the name its catalog card shows. */
interface DevAgent {
  id: string;
  name: string;
}

const devAgents = (): Partial<Record<keyof Agents, DevAgent>> =>
  JSON.parse(process.env.E2E_DEV_AGENTS ?? '{}') as Partial<Record<keyof Agents, DevAgent>>;

/** The catalog name of a dev or local agent (E2E_DEV_AGENTS). */
export const devAgentName = (key: keyof Agents): string | undefined => devAgents()[key]?.name;

/** Whether the answers are the scripted model's, whose exact text the specs can check. */
export const scripted = (): boolean => target() === 'fakes';

/** What the specs ask the dev chat agent: a question it answers itself, without tools. */
export const DEV_QUESTION =
  process.env.E2E_DEV_QUESTION ?? 'Hello! In one short sentence, what can you help me with?';

/**
 * The agents the specs use, by workflow ID: the e2e server's scripted workflows, or the dev and
 * local agents in E2E_DEV_AGENTS, for example `{"chat": {"id": "<workflow ID>", "name": "all-agents"}}`.
 * `concierge` is the builder's Travel Concierge template, which only a real model can run.
 */
export interface Agents {
  chat?: string;
  report?: string;
  approval?: string;
  quantity?: string;
  support?: string;
  concierge?: string;
}

export function agents(): Agents {
  if (target() !== 'fakes')
    return Object.fromEntries(Object.entries(devAgents()).map(([key, agent]) => [key, agent.id])) as Agents;
  const file = process.env.E2E_TOKENS_FILE ?? path.join(AUTH_DIR, 'tokens.json');
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { workflows: Agents }).workflows;
}

/** The display names of the scripted workflows (tests/e2e/e2e-server.ts in the server repository). */
export const NAMES = {
  chat: 'Energy Analyst',
  report: 'Usage Report',
  approval: 'Purchase Approval',
  quantity: 'Order Quantity',
  support: 'Customer Support',
} as const;
