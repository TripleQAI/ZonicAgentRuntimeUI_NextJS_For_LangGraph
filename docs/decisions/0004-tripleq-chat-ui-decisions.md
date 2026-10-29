# 0004 TripleQ AI Brand and Chat-First Layout

| Item | Detail |
|---|---|
| Date | 28 October 2026 |
| Status | Built, pending review |
| Replaces | The InSite brand of decisions UB-2 (provider ID) and UB-9 (colour contrast) |

| ID | Topic | Decision | Reason |
|---|---|---|---|
| UD-1 | Brand | The UI uses the TripleQ AI look of the welcome site (`ZonicWelcomeWeb_FullStack`, `shared/config/site.config.json` `theme.tokens`): a dark page (`#08070d`), the orange accent (`#ff6a1a`, soft `#ff9a4d`), the Agent Run blue (`#4da3ff`) for the product name, Inter, the logo icon and the TRIPLE**Q**AI wordmark (`src/components/shell/Brand.tsx`). Every InSite token, logo, footer text and copy line is gone; the brand words are in `messages/en.json` like all other text. | The user asked for the TripleQ AI style and for everything InSite to be removed. |
| UD-2 | Contrast | Filled buttons use dark ink on the orange (7:1); white on it would be 2.9:1. Muted text is the site's `rgba(226, 230, 242, 0.68)` flattened to `#a3a6b1` (7.7:1 on the surface). Error text and borders are `#ff7a66`. ECharts uses its dark theme on a transparent background; AG Grid's Quartz theme runs in dark mode. | WCAG AA on a dark page. |
| UD-3 | Sign-in provider | The OIDC provider's ID is `tripleq` (was `insite`), so the callback path is `/api/auth/callback/tripleq`, and the button reads "Sign in with TripleQ AI". The Cognito app client must list `http://localhost:3000/api/auth/callback/tripleq` (and each deployment's equivalent). | UD-1; the ID is part of the callback URL. |
| UD-4 | Chat first | The home page is a new chat: a greeting, one chip per agent (the first, or `?agent=<id>`, preselected) and the composer ready at once. The "Agents" nav item and the app footer are gone; the window is the sidebar (now "Chats") and the conversation, in a centred column of at most 48rem. The agent's answer spans the column; the user's text is a bubble on the right. Run details stay one click away from each answer. | The user asked for a chat-focused UI. |
