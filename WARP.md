# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## License and usage

This project is licensed for educational use only. Commercial use (including running as a business/SaaS, generating income, or re-selling/republishing the code) requires purchasing a license from the vendor referenced in `README.md`.

## Commands

All commands below assume a Node.js environment compatible with Next.js 14.

### Install dependencies

```bash
npm install
```

This will also run `prisma generate` via the `postinstall` script.

### Local development

Start the Next.js dev server (App Router, port 3000 by default):

```bash
npm run dev
```

### Build and run in production mode

Build the application:

```bash
npm run build
```

Start the production server (after building):

```bash
npm run start
```

### Linting

Run ESLint with the Next.js core-web-vitals config:

```bash
npm run lint
```

### Database / Prisma

The app uses Prisma with a PostgreSQL database (`DATABASE_URL`) defined in `prisma/schema.prisma`.

Apply migrations locally (creates the schema defined under `prisma/migrations`):

```bash
npx prisma migrate dev
```

Regenerate the Prisma client (if you change the schema):

```bash
npx prisma generate
```

(Optional) Open Prisma Studio:

```bash
npx prisma studio
```

### Tests

There is currently no configured test script or test runner in `package.json`. If you add one (for example via Jest or Vitest), update this section with the appropriate `npm test` / single-test commands.

## High-level architecture

### Framework and entrypoints

- This is a Next.js 14 App Router project rooted under `src/app`.
- Global layout is defined in `src/app/layout.tsx` and wraps the tree with:
  - `ClerkProvider` for authentication.
  - `ThemeProvider` (Next Themes) with dark mode default.
  - `ReduxProvider` for global client-side state.
  - `ReactQueryProvider` for data fetching and caching.
  - `sonner` `Toaster` for notifications.
- Tailwind CSS is configured in `tailwind.config.ts` and `src/app/globals.css`, with additional design tokens for charts and a sidebar.

### Routing structure

The app uses route groups in `src/app` to separate concerns:

- `(website)`
  - `src/app/(website)/page.tsx` implements the public marketing/landing page at `/` with pricing cards and CTAs driving users into the app.

- `(auth)`
  - `src/app/(auth)/layout.tsx` centers auth pages vertically/horizontally.
  - `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` and the corresponding sign-up route use Clerk components (`<SignIn />`, `<SignUp />`) for authentication flows.

- `(protected)` (authenticated application surface)
  - `src/app/(protected)/dashboard/page.tsx` onboards or looks up the current user via the `onBoardUser` server action and then redirects to a personalized dashboard slug (`/dashboard/{firstname}{lastname}`).
  - `src/app/(protected)/dashboard/[slug]/page.tsx` renders the main dashboard UI using `DASHBOARD_CARDS` and a metrics chart/summary.
  - `src/app/(protected)/callback/instagram` handles the OAuth redirect from Instagram; it exchanges the `code` for tokens via `onIntegrate` and then redirects into the dashboard integrations view.
  - `src/app/(protected)/payment` contains the payment flow pages.
  - `src/app/(protected)/api/payment/route.ts` defines a server route that creates a Stripe Checkout session for subscriptions.
  - `src/app/(protected)/api/webhook/instagram/route.ts` is the main webhook ingestion endpoint for Instagram/Facebook events (DMs and comments). It ties together keyword matching, automations, OpenAI, and Instagram message sending.

`src/middleware.ts` uses `clerkMiddleware` with `createRouteMatcher` to enforce authentication on:

- `/dashboard(.*)`
- `/api/payment(.*)`
- `/callback(.*)`

and is configured to skip static assets while always running for API routes.

### Data model (Prisma)

`prisma/schema.prisma` defines the main domain entities:

- `User` — linked to Clerk via `clerkId`, stores email and optional first/last names. Has a one-to-one `Subscription`, and one-to-many `Integrations` and `Automation` records.
- `Subscription` — tracks plan (`FREE` or `PRO`), creation/update timestamps, and an optional `customerId` for Stripe.
- `Integrations` — currently models Instagram integrations; stores `name` (enum `INTEGRATIONS`, currently `INSTAGRAM`), an access `token`, expiry (`expiresAt`), and `instagramId` for the connected account.
- `Automation` — core automation entity with `name`, `active` flag, and relations to:
  - `Trigger[]` (what events start the automation: DM or Comment).
  - `Listener?` (how to respond: static message vs Smart AI).
  - `Post[]` (posts the automation is attached to, for comment-based triggers).
  - `Dms[]` (stored message history where needed).
  - `Keyword[]` (keywords that activate the automation).
- `Trigger` — associates an automation with a `type` string (values like `COMMENT` / `DM` are enforced at the app layer).
- `Listener` — one-per-automation configuration capturing:
  - `listener` enum (`LISTENERS`: `MESSAGE` or `SMARTAI`).
  - `prompt` and optional `commentReply`.
  - Simple counters (`dmCount`, `commentCount`) used for dashboard metrics.
- `Post` — stores media references (`postid`, `media`, `mediaType`) for Instagram posts bound to an automation.
- `Dms` — stores inbound/outbound DM metadata tied back to an automation.
- `Keyword` — unique `(automationId, word)` pairs, ensuring a keyword cannot be reused across multiple automations.

Enums:

- `SUBSCRIPTION_PLAN` — `FREE`, `PRO`.
- `INTEGRATIONS` — currently `INSTAGRAM`.
- `MEDIATYPE` — `IMAGE`, `VIDEO`, `CAROSEL_ALBUM`.
- `LISTENERS` — `SMARTAI`, `MESSAGE`.

### Server actions and data access

Server actions under `src/actions` mediate access between UI components and the database/external APIs:

- `src/actions/automations`
  - High-level operations such as `createAutomations`, `getAllAutomations`, `getAutomationInfo`, `updateAutomationName`, `saveListener`, `saveTrigger`, `saveKeyword`, `deleteKeyword`, `getProfilePosts`, `savePosts`, and `activateAutomation`.
  - These actions always derive the current user via `onCurrentUser` (from `src/actions/user`) and then delegate to lower-level query helpers in `src/actions/automations/queries.ts`.
  - Automations also call out to Instagram Graph via `getProfilePosts` using the integration token, and attach posts to automations.

- `src/actions/integrations`
  - `onOAuthInstagram(strategy)` starts the Instagram OAuth flow by redirecting to `INSTAGRAM_EMBEDDED_OAUTH_URL`.
  - `onIntegrate(code)` exchanges the code for a long-lived token using `generateTokens` from `src/lib/fetch`, then persists an `Integrations` record (with `token`, expiry, and `instagramId`) for the current user.

- `src/actions/user` (and `src/actions/user/queries.ts`, not fully enumerated here) manage onboarding (`onBoardUser`), user profile lookup, and are used by dashboard routing and React Query prefetching.

Database access is centralized through the Prisma client in `src/lib/prisma.ts`, which uses a global singleton pattern in development to avoid connection issues.

### React Query and prefetching

- `src/providers/react-query-provider.tsx` instantiates a global `QueryClient` and wraps the component tree.
- `src/react-query/prefetch.ts` provides helpers to pre-populate the cache on the server:
  - `PrefetchUserProfile` → `onUserInfo` action.
  - `PrefetchUserAutnomations` → `getAllAutomations`.
  - `PrefetchUserAutomation` → `getAutomationInfo(automationId)`.

These are intended to be used in server components to reduce client-side loading states.

### Client state and hooks

- Redux:
  - `src/redux/store.ts` configures a Redux Toolkit store with an `AutmationReducer` slice.
  - `src/redux/slices/automation.ts` manages the transient automation builder state (`trigger.types` etc.), using `duplicateValidation` from `src/lib/utils` to toggle selected trigger types.

- Custom hooks in `src/hooks` encapsulate client-side flows around automations and user interactions, for example:
  - `useCreateAutomation`, `useEditAutomation`, `useListener`, `useTriggers`, `useKeywords`, `useAutomationPosts` in `src/hooks/use-automations.ts`.
    - These wrap React Query mutations via `useMutationData` and use Redux (`TRIGGER` action) plus local React state to manage UI.
  - Other hooks (e.g. `use-subscription`, `use-mobile`, `use-zod-form`, `user-queries`) are layered on top of React Query/Zod to keep components lean.

### Webhooks, OpenAI, and Instagram integration

The Instagram webhook route `src/app/(protected)/api/webhook/instagram/route.ts` drives the automation engine:

- On `GET`, it echoes back `hub.challenge` for webhook verification.
- On `POST`, it:
  - Parses the incoming `webhook_payload` and routes based on whether the event is a DM (`messaging`) or a comment (`changes[field === 'comments']`).
  - Uses `matchKeyword` from `src/actions/webhook/queries.ts` to find which automation (if any) matches the incoming message text.
  - For matched automations:
    - If listener is `MESSAGE`, sends a static reply via `sendDM` or `sendPrivateMessage` from `src/lib/fetch.ts`, and calls `trackResponses` to increment DM/comment counters.
    - If listener is `SMARTAI` and the user’s subscription plan is `PRO`, uses the `openai` client from `src/lib/openai.ts` to generate a short response (`gpt-4o`), persists conversation turns via Prisma transactions (`createChatHistory`, `client.$transaction`), then sends the AI-generated message back over Instagram.
  - If no keyword matches are found, it attempts to fetch prior chat history (`getChatHistory`) and may continue a Smart AI conversation when appropriate.

`src/lib/fetch.ts` centralizes Instagram HTTP calls (refreshing tokens, sending DMs, sending comment replies) and the OAuth token exchange flow (`generateTokens`). The token exchange logic is careful to align `redirect_uri` with `INSTAGRAM_EMBEDDED_OAUTH_URL` / `NEXT_PUBLIC_HOST_URL` because Meta requires an exact match.

### Stripe integration

- `src/lib/stripe.ts` exports a configured Stripe client using `STRIPE_CLIENT_SECRET`.
- `src/app/(protected)/api/payment/route.ts` creates subscription checkout sessions using `STRIPE_SUBSCRIPTION_PRICE_ID` and success/cancel URLs built from `NEXT_PUBLIC_HOST_URL`.
- `Subscription` records in Prisma (and the `SUBSCRIPTION_PLAN` enum) gate access to Smart AI features in the webhook and UI.

### OpenAI integration

- `src/lib/openai.ts` exports an `openai` instance configured with `OPEN_AI_KEY`.
- The webhook route uses `openai.chat.completions.create` with the `gpt-4o` model to generate short, on-brand replies for Smart AI automations.

### UI components

- `src/components/ui` contains a set of reusable primitives (buttons, cards, dialogs, menus, charts, etc.) in a Shadcn-style Tailwind setup.
- `src/components/global` contains feature-level components for:
  - Automation building (trigger configuration, keyword management, post selection, activation button).
  - Layout elements like sidebar, breadcrumbs, billing UI, loaders, and subscription plans.
- Icons live under `src/icons` and are wired into constants such as `AUTOMATION_TRIGGERS` / `AUTOMATION_LISTENERS` (`src/constants/automation.tsx`) and `DASHBOARD_CARDS` (`src/constants/dashboard.ts`) to define the automation builder and dashboard cards declaratively.

### Environment and configuration

Key configuration files and concerns:

- `tsconfig.json` — sets up strict TypeScript compilation and a path alias `@/*` → `./src/*`.
- `next.config.mjs` — configures remote image domains for Instagram/CDN assets.
- `.eslintrc.json` — extends `next/core-web-vitals`.
- `tailwind.config.ts` — controls theming and utility scanning paths (`./pages`, `./components`, `./app`, `./src`).

Important environment variables used throughout the codebase (non-exhaustive, but frequently referenced):

- `DATABASE_URL` — PostgreSQL connection string for Prisma.
- `OPEN_AI_KEY` — OpenAI API key.
- `STRIPE_CLIENT_SECRET`, `STRIPE_SUBSCRIPTION_PRICE_ID` — Stripe subscription configuration.
- `NEXT_PUBLIC_HOST_URL` — public base URL used in redirect and webhook URLs.
- Instagram / Meta-related:
  - `INSTAGRAM_BASE_URL`
  - `INSTAGRAM_EMBEDDED_OAUTH_URL`
  - `INSTAGRAM_TOKEN_URL`
  - `INSTAGRAM_CLIENT_ID`
  - `INSTAGRAM_CLIENT_SECRET`

Clerk authentication expects its usual environment/configuration (e.g. Clerk publishable/secret keys), but those are not hard-coded in this repo.
