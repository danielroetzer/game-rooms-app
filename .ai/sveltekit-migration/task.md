# SvelteKit Migration

## Goal

Migrate the project from plain Svelte + Vite to SvelteKit with:
- **File-based routing** replacing the hand-rolled hash router
- **SSR** for dynamic pages that depend on SpacetimeDB (lobby, game)
- **Prerendering** (`prerender: true`) for purely static pages (e.g., home page with hardcoded game selection)
- **`adapter-node`** (or suitable adapter) to support SSR at runtime for dynamic routes

## Current State

- Plain Svelte 5 + Vite 6 with `@sveltejs/vite-plugin-svelte`
- Entry: `index.html` → `src/main.ts` → `src/Root.svelte` → `src/App.svelte`
- Hand-rolled hash router in `src/lib/router.ts`
- SpacetimeDB provider in `Root.svelte` using `createSpacetimeDBProvider()`
- Backend (SpacetimeDB module in `spacetimedb/`) is complete and unaffected by this migration

## Routes

| Path | SSR | Prerender | Description |
|------|-----|-----------|-------------|
| `/` | N/A | Yes | Home page — static game picker, prerendered at build time |
| `/lobby/[roomCode]` | Yes | No | Lobby — SSR at runtime, hydrates with SpacetimeDB client-side |
| `/game/[roomCode]` | Yes | No | Game — SSR at runtime, hydrates with SpacetimeDB client-side |

## Constraints

- SpacetimeDB client SDK requires browser APIs (WebSocket, localStorage) — provider setup must be guarded for client-only execution (e.g., `browser` check from `$app/environment`)
- Dynamic routes (`/lobby/[roomCode]`, `/game/[roomCode]`) cannot be prerendered (room codes are runtime-generated) — they use SSR at runtime instead
- SSR renders the page shell server-side; SpacetimeDB data is loaded client-side after hydration
- Need an adapter that supports SSR (`adapter-node` or similar) — `adapter-static` alone cannot do runtime SSR
- Generated module bindings in `src/module_bindings/` must remain accessible
