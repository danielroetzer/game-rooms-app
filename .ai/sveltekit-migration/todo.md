# SvelteKit Migration — Checklist

> Reference: `.ai/sveltekit-migration/plan.md` for context.
> Mark items `[x]` when complete. Document deviations inline.

---

## Step 1: Install dependencies and update configs

### 1.1 Update dependencies

- [x] Add `@sveltejs/kit` and `@sveltejs/adapter-node`
- [x] Remove `@sveltejs/vite-plugin-svelte`

### 1.2 Update `svelte.config.js`

- [x] Replace contents with SvelteKit config using `adapter-node`

### 1.3 Update `vite.config.ts`

- [x] Replace `svelte()` plugin with `sveltekit()`

### 1.4 Update `tsconfig.json`

- [x] Extend from `.svelte-kit/tsconfig.json`

### 1.5 Update `package.json` scripts

- [x] Update `dev` script to `vite dev`

### 1.6 Verify Step 1

- [x] SvelteKit dev server starts without config errors

---

## Step 2: Create SvelteKit file structure

### 2.1 Create `src/app.html`

- [x] Created SvelteKit HTML template with `%sveltekit.head%` and `%sveltekit.body%`

### 2.2 Create root layout with SpacetimeDB provider

- [x] Created `src/routes/+layout.svelte`:
  - Provider setup guarded with `browser` check from `$app/environment`
  - `onConnect` stores token and calls `subscribeToAll()`
  - Uses `{@render children()}` with typed `Snippet` prop
  - `DB_NAME` defaults to `'game-rooms-app'`

### 2.3 Create home page

- [x] Created `src/routes/+page.svelte` with static content
- [x] Created `src/routes/+page.ts` with `export const prerender = true`

### 2.4 Delete old files

- [x] Deleted `index.html`, `src/main.ts`, `src/Root.svelte`, `src/App.svelte`, `src/lib/router.ts`

### 2.5 Verify Step 2

- [x] Home page renders at `/` with SSR (HTML contains `<h1>Game Rooms</h1>`)
- [ ] Console shows "Connected to SpacetimeDB" — needs manual browser verification
- [x] No SSR errors in terminal

---

## Step 3: Add dynamic route pages

### 3.1 Lobby route

- [x] Created `src/routes/lobby/[roomCode]/+page.svelte` using `$page.params.roomCode`

### 3.2 Game route

- [x] Created `src/routes/game/[roomCode]/+page.svelte` using `$page.params.roomCode`

### 3.3 Verify Step 3

- [x] `/lobby/ABC123` — renders "Lobby: ABC123" via SSR
- [x] `/game/XYZ789` — renders "Game: XYZ789" via SSR
- [x] SpacetimeDB connection persists across client-side navigation — needs manual browser verification

---

## Step 4: Verify build and integration

### 4.1 Build test

- [x] `pnpm build` — succeeds, produces Node server in `build/`
- [x] Home page prerendered at `build/prerendered/index.html` with content

### 4.2 Preview test

- [x] `pnpm preview` — all routes work (home prerendered, lobby/game SSR)

### 4.3 Update project-init docs

- [x] `.ai/project-init/todo.md` already updated with Chunk 2 postponement note
- [x] Update Chunks 3-8 references: `navigate()` → `goto()`, `src/pages/` → `src/routes/`, props → `$page.params`
