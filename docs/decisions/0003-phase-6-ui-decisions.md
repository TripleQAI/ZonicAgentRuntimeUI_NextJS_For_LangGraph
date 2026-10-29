# 0003 Phase 6 UI Decisions

| Item | Detail |
|---|---|
| Date | 28 October 2026 |
| Status | Built with Phase 6 (tasks P6-01, P6-04, P6-05), pending review at M6 |
| Server record | `ZonicAgentRuntimeServer_Nodejs/docs/decisions/0009-phase-6-build-decisions.md` |

| ID | Topic | Decision | Reason |
|---|---|---|---|
| UC-1 | Content Security Policy | `src/middleware.ts` gives every page a policy with a fresh nonce (`src/lib/security/csp.ts`): scripts only from this origin with the nonce and `strict-dynamic` (Next.js puts the nonce on its own scripts), no inline scripts, no plugins, no framing, `connect-src 'self'`. Styles may be inline (React style attributes, the grid and the chart). Extra style and font origins come from `CSP_STYLE_ORIGINS` and `CSP_FONT_ORIGINS` (default: Google Fonts). The root layout reads the request, so every page renders per request and gets its nonce. | Plan task P6-01: "UI Content Security Policy without inline scripts". The end-to-end suite fails on any policy violation. |
| UC-2 | Middleware | Auth.js's lazy configuration makes its wrapper a promise, so `middleware` awaits it. With a custom handler, Auth.js no longer redirects signed-out users itself: the middleware sends them to `/login` with a `callbackUrl` that is a path, not a URL. | Behind a load balancer the request's own host is the container's (`0.0.0.0:3000`); found by running the image. |
| UC-3 | Container image | `Dockerfile` builds the Next.js standalone server (`NEXT_OUTPUT=standalone` only in the image build, since `next start` needs the default output). Server settings come from the environment at run time. | Plan task P6-04: UI hosting on ECS (the server's `infra/`). |
| UC-4 | End-to-end targets | Dev agents in `E2E_DEV_AGENTS` are `{id, name}`; against a real model the specs ask `E2E_DEV_QUESTION` and check what any answer must do; longer timeouts on dev. | The dev half of M5 (decision UB-22 of record 0002). |
