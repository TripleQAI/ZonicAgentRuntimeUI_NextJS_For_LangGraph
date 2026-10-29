# CLAUDE.md

Zonic Agent Runtime UI (Next.js 15 App Router, React 19, TypeScript strict, Tailwind, TanStack Query, Zustand). Build it task by task (U0-01 to U5-11) from the plan in the server repository; the design wins over the plan.

This repository is the copy for the LangGraph runtime, with its own configuration (port 3001, its own `.env.local`). Every backend binding is the LangGraph runtime `../ZonicAgentRuntimeBackend_Python_LangGraph`: the API (`RUNTIME_API_URL`), the vendored contract (`npm run sync:contract`) and the e2e targets. Never change `../ZonicAgentRuntimeUI_NextJS` or its config from here.

- Runtime design: `../ZonicAgentRuntimeBackend_Python_LangGraph/docs/zonic-agent-runtime-langgraph-architecture-design.md` (Section 14: API and streaming contract; 16.2: patterns in the runtime UI)
- Client guide and contract differences: `../ZonicAgentRuntimeBackend_Python_LangGraph/docs/client-integration.md`, `docs/contract-review.md`
- Sanity cases: group U is defined only in `../ZonicAgentRuntimeServer_Nodejs/tests/catalog.yaml` (the LangGraph catalog has none); a test proves a case when its title starts with the ID: `it('[U-03] ...')`

## Gates

`npm run lint`, `npm run typecheck`, `npm test`, `npm run gen:api:check`, `npm run build`. `npm run test:e2e` needs `E2E_TARGET=dev` or `local`: the LangGraph runtime has no fakes server yet (`playwright.config.ts`).

`scripts/gen-api.mjs` types the LangGraph contract as it is sent: in HTTP response models an optional field that cannot be null is required (responses drop only nulls); in events and content parts only `type` is, so guard their other optional fields.

## Rules

- Call the runtime only through `src/lib/api/client.ts` and the generated types; never call the gateway, the MCP server or a model.
- API types are generated: add a server model to `api-models.json` instead of writing a type by hand, then `npm run sync:contract` and `npm run gen:api`. Never edit `contract/` or `src/lib/api/generated/` by hand.
- No user-facing text in components: use `t()` and `messages/en.json`.
- TripleQ AI visual brand (the welcome site's dark theme, `ZonicWelcomeWeb_FullStack`): tokens in `src/styles/globals.css` and `tailwind.config.ts`; focus rings on every interactive element; WCAG AA contrast.
- Chat first: the home page is a new chat (agent chips over the composer); there is no separate catalog page.
- No `console` calls; only `src/lib/config` reads `process.env`.
- Content parts are data: never render server HTML outside the sandboxed `html` renderer.

## Workspace conventions

- Leave changes uncommitted; the user commits.
- Secrets stay in `.env.local`; never print or commit them.
