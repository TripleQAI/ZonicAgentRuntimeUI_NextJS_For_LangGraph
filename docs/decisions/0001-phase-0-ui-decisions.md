# 0001 Phase 0 UI Decisions

| Item | Detail |
|---|---|
| Date | 25 October 2026 |
| Status | Accepted at checkpoint M0, pending the architect's review |

| ID | Topic | Decision | Reason |
|---|---|---|---|
| UB-1 | Token handling | The browser calls `/api/runtime/*` on its own origin; that route handler adds the access token from the encrypted Auth.js session cookie and streams the runtime's response back. The session object sent to the browser has no token. | The access token never reaches browser JavaScript; there is no CORS between the UI and the runtime; SSE streams pass through unchanged. The design's "fetch wrapper with token" is kept for server-side callers (`getToken` option). |
| UB-2 | Identity provider (Q1) | One generic OIDC provider (`id: insite`) configured from `AUTH_OIDC_*`; the default issuer in `.env.example` is the Cognito pool of decision Q1. | The issuer and audience are settings, as the plan asks until Q1 is decided. |
| UB-3 | Middleware runtime | Auth.js middleware runs on the Node.js runtime. | Removes the Edge-runtime warning from `jose` and lets middleware read the same configuration module. |
| UB-4 | API types before the OpenAPI document | `npm run gen:api` generates model types from the server's class-model JSON Schemas (listed in `api-models.json`) now, and path types from `generated/openapi.json` once task P2-03 publishes it. The server gained the `ErrorEnvelope` class model for this. | Contracts first: the client's error handling is typed from the server model, and the drift check (U-14) works from Phase 0. |
| UB-5 | Muted text color | Muted text uses gray-700 (`#4F5660`) instead of the skill's gray-500. | Gray-500 on white is about 3.3:1, below WCAG AA (4.5:1), which the same skill requires. |
| UB-6 | Fonts | Nunito is loaded from Google Fonts with a `<link>` (the brand skill's method), not `next/font`. | Builds work offline. The Content Security Policy of task P6-01 must allow `fonts.googleapis.com` and `fonts.gstatic.com`. |
| UB-7 | Vendored contract | `npm run sync:contract` copies the server models listed in `api-models.json`, every model they reference and `generated/openapi.json` (once published) into `contract/`, with `SOURCE.json` (server commit, `-dirty` for uncommitted generated files, SHA-256 per file). `npm run gen:api` reads only `contract/`; CI no longer checks out the server. | The server repository is private, so CI's checkout of it failed with "Not Found" (no `RUNTIME_SERVER_READ_TOKEN` secret). Every contract change now arrives as a reviewed diff, as the server's `sync:builder` does for the builder. |
| UB-8 | Silent token refresh (U-11, in part) | The Auth.js `jwt` callback refreshes an access token within `EXPIRY_SKEW_SECONDS` of expiry at the issuer's token endpoint (OIDC discovery, refresh token grant), on the server. The runtime proxy refreshes an expired token through the session before forwarding and returns the refreshed session cookie. A failed refresh drops the access token and marks the session `RefreshTokenError`, so the proxy answers 401. | Without it, every call failed once the access token expired (one hour on Cognito). The browser still never sees a token (UB-1). The sign-in prompt that keeps the user's input is task U5-09. |
