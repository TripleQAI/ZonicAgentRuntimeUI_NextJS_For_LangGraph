# ZonicAgentRuntimeUI_NextJS_For_Langgraph

A copy of `ZonicAgentRuntimeUI_NextJS` (2026-10-28) bound to the LangGraph runtime, `ZonicAgentRuntimeBackend_Python_LangGraph`, with its own configuration: port 3001, its own `.env.local` and `AUTH_SECRET`, and `RUNTIME_API_URL` pointing at the LangGraph runtime (deployed dev: https://d2mqmloek8azsa.cloudfront.net). The original stays on the Node.js runtime and port 3000.

The Zonic Agent Runtime UI (TripleQ AI Agent Run), chat first: a new chat with the agent picker over the composer, chat with true token streaming, sessions, human-input and approval forms, and the run timeline. It talks to the LangGraph runtime only through the runtime's published API contract, vendored in `contract/`.

- Runtime design, client guide and contract review: `../ZonicAgentRuntimeBackend_Python_LangGraph/docs/`
- Decisions for the UI: [docs/decisions/](docs/decisions/); brand and chat-first layout: [0004](docs/decisions/0004-tripleq-chat-ui-decisions.md)

## Nebius x NVIDIA Global AI Hackathon

This repository is part of the Zonic agent platform, our entry in the Nebius x NVIDIA Global AI Hackathon (Best Apps and Agents track). The platform's agents run on NVIDIA Nemotron models served by Nebius Token Factory. How that is wired, and which model does what, is in the runtime's README: [NVIDIA Nemotron on Nebius Token Factory](https://github.com/TripleQAI/ZonicAgentRuntimeBackend_Python_LangGraph#nvidia-nemotron-on-nebius-token-factory).

**This repository's part:** The chat where people use the Nemotron-powered agents. Nemotron's tokens stream from Token Factory through the runtime into the chat, and each answer's steps show which agent answered and which tools it called.

**Live demo:** the chat at https://dev.tripleq.ai/agent-runtime-lg and the agent builder at https://dev.tripleq.ai/agent-visual-builder-lg/workflows. Both sign in with Amazon Cognito; the test accounts are in the hackathon submission's testing instructions.

| Repository | Role |
|---|---|
| [ZonicAgentBuilderUI_NextJS](https://github.com/TripleQAI/ZonicAgentBuilderUI_NextJS) | The visual builder: design a workflow and pick a Nemotron model for each node |
| [ZonicAgentBuilderServer_FastAPI](https://github.com/TripleQAI/ZonicAgentBuilderServer_FastAPI) | The builder's API: validation, import and export, the node registry and model options |
| [ZonicAgentRuntimeBackend_Python_LangGraph](https://github.com/TripleQAI/ZonicAgentRuntimeBackend_Python_LangGraph) | Runs the workflows on LangGraph and calls Nemotron through Token Factory |
| **ZonicAgentRuntimeUI_NextJS_For_LangGraph** (this repository) | The chat app people use the agents in |
| [ZonicMCPServer_FastAPI](https://github.com/TripleQAI/ZonicMCPServer_FastAPI) | The agents' tools over open data |
| [ZonicPostgresqlServer_FastAPI](https://github.com/TripleQAI/ZonicPostgresqlServer_FastAPI) | The PostgreSQL gateway every service stores data through (Neon) |

### Differences from the Node.js contract

The UI follows the LangGraph runtime where its contract differs (its `docs/contract-review.md`):

- **Node timeline** (`GET /v1/runs/{runId}/nodes`): `TimelineEntry` names no node and carries no input or output, so a run rebuilt from it shows the node ID as the name, and the run page has no "node inputs and outputs" section.
- **Node status**: `succeeded`, `failed`, `interrupted`, `continued` (Node.js: `completed`, `failed`).
- **Error details**: `{path, message, type}`; a form shows `message` beside its field (Node.js: `constraints`).
- **Optional fields**: the runtime's schemas mark defaulted fields optional. `scripts/gen-api.mjs` makes them required in HTTP response models, which always send them; events and content parts can omit them, so the renderers fall back to empty values.

## Status

Phase 5 of the plan (tasks U5-01 to U5-10) is built: the agent catalog and composer, chat with true token streaming (stop, reconnect without duplicates), content-part renderers (markdown, table, AG Grid over `/v1/datasets`, ECharts, card, JSON, file, sandboxed HTML, citation, error, form), the session sidebar, human-input and approval forms, the run timeline and trace, message actions (copy, feedback, export to PDF), and the accessibility and contract checks. Decisions: [docs/decisions/0002-phase-5-ui-decisions.md](docs/decisions/0002-phase-5-ui-decisions.md).

Phase 6 added a Content Security Policy without inline scripts (a nonce per request, `src/middleware.ts`) and a container image (`Dockerfile`) for the ECS deployment in the server's `infra/`. Decisions: [docs/decisions/0003-phase-6-ui-decisions.md](docs/decisions/0003-phase-6-ui-decisions.md).

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Development server on port 3001 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit and component tests (Vitest, Testing Library) |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |
| `npm run sync:contract` | Vendor the LangGraph runtime's contract (`generated/openapi.json`, `generated/schemas/`) into `contract/` (from `../ZonicAgentRuntimeBackend_Python_LangGraph`, or `RUNTIME_SERVER_DIR`) |
| `npm run gen:api` | Generate the API types from the vendored contract in `contract/` |
| `npm run gen:api:check` | Fail when the generated types differ from the contract |
| `npm run test:e2e` | Playwright end-to-end tests (task U5-10) against the LangGraph runtime, `E2E_TARGET=dev` or `local`; see below |

## Configuration

Copy `.env.example` to `.env.local`. `src/lib/config/runtime.ts` is the only module that reads the environment. `CSP_STYLE_ORIGINS` and `CSP_FONT_ORIGINS` add origins to the Content Security Policy (default: Google Fonts).

## Container image

`docker build -t zonic-agent-runtime-ui-langgraph .` builds the Next.js standalone server (port 3000). Give it the same variables as `.env.example` at run time; `NEXT_PUBLIC_*` values are fixed at build time. The runtime's own deployment: `../ZonicAgentRuntimeBackend_Python_LangGraph/docs/runbooks/deploy.md`.

## How requests reach the runtime

The browser calls `/api/runtime/...` on its own origin. That route handler reads the user's access token from the encrypted Auth.js session cookie and forwards the request to the runtime with `Authorization: Bearer ...`, streaming the response back unchanged (SSE included). The browser never holds the access token. An expiring token is refreshed on the server, and the refreshed session cookie comes back with the response.

## End-to-end tests

The default target, `fakes`, needs a runtime with fakes and a scripted model that the suite can start. The LangGraph runtime has none yet (its fakes app, `tests/api/app.py`, runs only inside pytest), so `npm run test:e2e` stops with an error unless `E2E_TARGET` is `dev` or `local`, and CI has no end-to-end job. The specs run on desktop Chrome (and the drawer test on a Pixel 7). Install the browser once with `npx playwright install chromium`.

Against dev: `E2E_TARGET=dev E2E_BASE_URL=<ui url> E2E_USERNAME=... E2E_PASSWORD=... E2E_DEV_AGENTS='{"chat":{"id":"<workflow id>","name":"<catalog name>"}}' npm run test:e2e`. The specs ask `E2E_DEV_QUESTION` (an answer without tools) and check what any real answer must do; tests that need the scripted workflows are skipped there. Timeouts are longer on dev (`E2E_TIMEOUT_MS`, `E2E_EXPECT_TIMEOUT_MS`).

A multi-turn chat with a real model: `tests/e2e/conversation.spec.ts` holds four turns with the builder's Travel Concierge (named `concierge` in `E2E_DEV_AGENTS`), on dev or against a runtime started on this machine: `E2E_TARGET=local E2E_DEV_AGENTS='{"concierge":{"id":"<workflow id>","name":"Travel Concierge"}}' npx playwright test`. The local target builds this UI on port 3100 against `E2E_RUNTIME_URL` (default `http://127.0.0.1:8000`, the LangGraph runtime's `uv run python -m zonic_runtime.server`) and signs in with the access tokens in `E2E_TOKENS_FILE` (`{"tokens": {"<user>": "<token>"}}`), which the runtime's issuer must accept.

## License

Licensed under the Apache License 2.0; see [LICENSE](LICENSE).
