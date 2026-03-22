# Implementation Plan: Game Rooms App

## Context

This is a new SpacetimeDB + SvelteKit project for playing Tic Tac Toe online or locally. The frontend uses SvelteKit with file-based routing, SSR for dynamic pages, and prerendering for static pages. SpacetimeDB provider is set up in the root layout, guarded with a `browser` check.

Local games still use the server (same game logic, no client-side duplication). The single connected identity controls both seats.

The plan is broken into 7 chunks, each independently verifiable.

---

## Chunk 1: Backend Schema — Player, Room, RoomMember, ChatMessage

**Goal**: Define core domain tables and reducers.

**Files**:
- `spacetimedb/src/schema.ts` — Table definitions + `schema()` export
- `spacetimedb/src/player.ts` — Lifecycle hooks + `set_name` reducer
- `spacetimedb/src/room.ts` — Room reducers + `generateRoomCode` helper
- `spacetimedb/src/chat.ts` — `send_message` reducer
- `spacetimedb/src/index.ts` — Re-exports + default schema export

**Tables**: Player, Room, RoomMember, ChatMessage (all public, with btree indexes)

**Reducers**: `set_name`, `create_room`, `join_room`, `leave_room`, `toggle_room_public`, `send_message`

**Verify**: Publish module, check logs, generate bindings.

---

## Chunk 2: Room Management UI

**Goal**: Create/join rooms, lobby with member list and chat.

**Files**:
- `src/routes/+page.svelte` (MODIFY) — Game cards, create/join room flows
- `src/routes/lobby/[roomCode]/+page.svelte` (MODIFY) — Full lobby: members, chat, invite link, start button
- `src/lib/components/Chat.svelte` (NEW) — Reusable chat (lobby + game)
- `src/lib/components/MemberList.svelte` (NEW) — Player list with seat assignments
- `src/lib/components/JoinDialog.svelte` (NEW) — Enter room code dialog

**Pattern**: `useTable(tables.room)` → filter client-side for current room. Route params via `$page.params.roomCode`. Navigation via `goto()` from `$app/navigation`.

**Verify**: Create room in one tab, join from another tab via code, chat works, public rooms browsable.

---

## Chunk 3: Game Engine Backend — Tic Tac Toe

**Goal**: Server-authoritative Tic Tac Toe with valid move broadcasting.

**Files**:
- `spacetimedb/src/schema.ts` (MODIFY) — Add `GameState` table
- `spacetimedb/src/games/tic-tac-toe.ts` (NEW) — Pure game logic functions
- `spacetimedb/src/game.ts` (NEW) — `start_game`, `make_move` reducers
- `spacetimedb/src/index.ts` (MODIFY) — Re-export game reducers

**Anti-cheat**: Server stores board + pre-computed `validMoves`. Client renders only what server provides.

**Verify**: Publish, generate bindings, verify GameState table and reducers in bindings.

---

## Chunk 4: Game UI — Tic Tac Toe Frontend

**Goal**: Render board, show valid moves, play a full game.

**Files**:
- `src/routes/game/[roomCode]/+page.svelte` (MODIFY) — Game container with board + chat
- `src/lib/components/games/TicTacToeBoard.svelte` (NEW) — 3x3 grid, clickable valid moves
- `src/lib/components/GameStatus.svelte` (NEW) — Turn indicator, game result
- `src/routes/lobby/[roomCode]/+page.svelte` (MODIFY) — Wire up "Start Game" button

**Key**: Route params via `$page.params.roomCode`. Navigation via `goto('/game/{roomCode}')`. Determine seat from RoomMember identity match.

**Verify**: Full game between two browser tabs — alternate turns, win/draw detection, game over screen.

---

## Chunk 5: Local Play Mode

**Goal**: Same-device play using the server (no client-side game logic duplication).

**Files**:
- `spacetimedb/src/room.ts` (MODIFY) — `create_room` supports `isLocal`, auto-starts game
- `src/routes/+page.svelte` (MODIFY) — "Local" / "Online" choice per game
- `src/routes/game/[roomCode]/+page.svelte` (MODIFY) — Local mode UI adjustments

**Design**: Local games create a server room with `isLocal=true`, both seats assigned to same identity, game starts immediately. `make_move` skips identity-to-seat check for local rooms.

**Verify**: Create local game, play both sides, win/draw detected.

---

## Chunk 6: Reconnection & Inactivity Cleanup

**Goal**: Graceful disconnect/reconnect + auto-delete inactive rooms.

**Reconnection**: Identity persists via localStorage token. RoomMember rows survive disconnect. Connection status banner in layout.

**Cleanup**: `CleanupJob` scheduled table. `touchRoom()` helper called from room-related reducers. 30 min timeout, 5 min for finished games.

**Verify**: Reconnect mid-game, cleanup fires on inactive rooms.

---

## Chunk 7: Accessibility

**Goal**: Keyboard navigation, ARIA attributes, screen reader support.

**Key items**: Grid roles on board, roving tabindex, live regions for game status, chat log role, focus management on navigation.

**Verify**: Keyboard-only gameplay, Lighthouse audit.

---

## Dependency Graph & Order

```
1 (Backend Schema)
├── 2 (Room UI)
│   └── 4 (TicTacToe UI) ← also needs 3
│       └── 5 (Local Play)
├── 3 (Game Engine)
├── 6 (Reconnection + Cleanup) ← after 3
└── 7 (Accessibility) ← after all others
```

**Recommended order**: 1 → 3 → 2 → 4 → 5 → 6 → 7

---

## Verification (End-to-End)

After all chunks:
1. `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
2. `pnpm run spacetime:generate`
3. `pnpm dev`
4. Open two browser tabs → create Tic Tac Toe room → join → chat → play full game
5. Test local play (same flow, single device controls both sides)
6. Test disconnect/reconnect mid-game
7. Verify inactive rooms get cleaned up
8. Lighthouse accessibility audit
