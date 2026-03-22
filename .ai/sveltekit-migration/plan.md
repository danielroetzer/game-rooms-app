# SvelteKit Migration — Plan

## Overview

Replace plain Svelte + Vite setup with SvelteKit. Static pages (home) are prerendered at build time. Dynamic pages (lobby, game) use SSR at runtime — the server renders the page shell, then SpacetimeDB data loads client-side after hydration.

---

## Step 1: Install dependencies and update configs

**Dependencies**:
- Add: `@sveltejs/kit`, `@sveltejs/adapter-node`
- Remove: `@sveltejs/vite-plugin-svelte` (SvelteKit manages Vite internally)

**Config changes**:
- `svelte.config.js` — use `adapter-node`
- `vite.config.ts` — replace `svelte()` plugin with `sveltekit()`
- `tsconfig.json` — extend from `.svelte-kit/tsconfig.json`
- `package.json` — update scripts (`dev`, `build`, `preview`) to use SvelteKit

**Verify**: `pnpm dev` starts SvelteKit dev server without errors.

---

## Step 2: Create SvelteKit file structure

**New files**:
- `src/app.html` — SvelteKit HTML template (replaces `index.html`)
- `src/routes/+layout.svelte` — SpacetimeDB provider wrapping all pages (logic from `Root.svelte`). Provider setup must be guarded with `browser` check from `$app/environment` since it uses WebSocket/localStorage.
- `src/routes/+page.svelte` — home page stub
- `src/routes/+page.ts` — `export const prerender = true`

**Delete**:
- `index.html`
- `src/main.ts`
- `src/Root.svelte`
- `src/App.svelte`
- `src/lib/router.ts`

**Verify**: `pnpm dev` shows home page at `/`.

---

## Step 3: Add dynamic route pages

**New files**:
- `src/routes/lobby/[roomCode]/+page.svelte` — lobby page stub, reads `$page.params.roomCode`
- `src/routes/game/[roomCode]/+page.svelte` — game page stub, reads `$page.params.roomCode`

These pages use SSR by default (SvelteKit's default behavior). No `+page.ts` needed unless we add load functions later.

**Verify**:
- `/lobby/ABC123` renders lobby stub with roomCode
- `/game/ABC123` renders game stub with roomCode
- `/` is prerendered (check `pnpm build` output)

---

## Step 4: Verify SpacetimeDB integration

- Connection established on page load (check console)
- `subscribeToAll()` called on connect
- Auth token stored/restored from localStorage
- Navigation between pages preserves connection
- No SSR errors (provider guarded with `browser` check)

**Verify**: Full dev server test — connection works, navigation works, build succeeds.

---

## Impact on project-init

After this migration, the `project-init` Chunk 2 (Frontend Scaffolding) is effectively replaced. Chunks 3-8 need minor adjustments:
- `navigate('#/lobby/...')` → `goto('/lobby/...')` from `$app/navigation`
- Page components move from `src/pages/` → `src/routes/.../+page.svelte`
- Route params via `$page.params.roomCode` instead of component props
- Shared components in `src/lib/components/` (accessible via `$lib/components/`)
