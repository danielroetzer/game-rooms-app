# Implementation Plan: Game Rooms App

## Context

This is a new SpacetimeDB + Svelte 5 project for playing Tic Tac Toe online or locally. The current codebase is a starter template with a placeholder `person` table. We need to build the full application: room/lobby system, chat, server-authoritative game engine, local play mode, and cleanup.

The frontend is a fully static SPA (SSG) — Svelte + Vite with no SSR/SvelteKit. All dynamic behavior comes from SpacetimeDB subscriptions at runtime.

Local games still use the server (same game logic, no client-side duplication). The single connected identity controls both seats.

The plan is broken into 8 chunks, each independently verifiable.

---

## Chunk 1: Backend Schema — Player, Room, RoomMember, ChatMessage

**Goal**: Replace placeholder `person` table with core domain tables and reducers.

**Files**:
- `spacetimedb/src/schema.ts` (NEW) — Table definitions + `schema()` export
- `spacetimedb/src/index.ts` (MODIFY) — Import from schema, define reducers + lifecycle hooks

**Tables**:
- `Player` (public): `identity` (primaryKey), `name`, `online`, `lastSeen`
- `Room` (public): `id` (autoInc PK), `code` (unique), `gameType`, `status`, `isPublic`, `isLocal`, `hostIdentity`, `maxPlayers`, `createdAt`, `lastActivity`
  - Index: `room_status` on `status`, `room_game_type` on `gameType`
- `RoomMember` (public): `id` (autoInc PK), `roomId`, `playerIdentity`, `seatIndex`, `joinedAt`
  - Index: `room_member_room_id` on `roomId`, `room_member_player` on `playerIdentity`
- `ChatMessage` (public): `id` (autoInc PK), `roomId`, `senderIdentity`, `content`, `sentAt`
  - Index: `chat_message_room_id` on `roomId`

**SDK note**: Index definitions use `accessor` (required), not `name`:
```ts
indexes: [{ accessor: 'room_member_room_id', algorithm: 'btree', columns: ['roomId'] }]
```

**Reducers**: `set_name`, `create_room`, `join_room`, `leave_room`, `toggle_room_public`, `send_message`
**Lifecycle**: `clientConnected` (upsert Player, online=true), `clientDisconnected` (online=false)
**Room codes**: Use `ctx.random.integerInRange()` to generate 6-char alphanumeric codes.

**Verify**: Publish module, check logs, generate bindings.

---

## Chunk 2: Frontend Scaffolding — Router, Pages, Connection

**Goal**: Set up hash-based routing and page structure.

**Files**:
- `src/lib/router.ts` (NEW) — Simple hash router using Svelte 5 `$state`
- `src/Root.svelte` (MODIFY) — Update connection config
- `src/App.svelte` (MODIFY) — Route-based page rendering
- `src/pages/HomePage.svelte` (NEW) — Game picker + public lobby list
- `src/pages/LobbyPage.svelte` (NEW) — Stub
- `src/pages/GamePage.svelte` (NEW) — Stub

**Routes**: `#/` (home), `#/lobby/:roomCode` (lobby), `#/game/:roomCode` (game)

**Subscriptions**: `subscribeToAll()` — all tables are public and dataset is small.

**Verify**: `pnpm dev`, navigate between routes, connection status works.

---

## Chunk 3: Room Management UI

**Goal**: Create/join rooms, lobby with member list and chat.

**Files**:
- `src/pages/HomePage.svelte` (MODIFY) — Game cards, create/join room flows
- `src/pages/LobbyPage.svelte` (MODIFY) — Full lobby: members, chat, invite link, start button
- `src/components/Chat.svelte` (NEW) — Reusable chat (lobby + game)
- `src/components/MemberList.svelte` (NEW) — Player list with seat assignments
- `src/components/JoinDialog.svelte` (NEW) — Enter room code dialog

**Pattern**: `useTable(tables.room)` → filter client-side for current room. Same for members/messages by roomId.

**Verify**: Create room in one tab, join from another tab via code, chat works, public rooms browsable.

---

## Chunk 4: Game Engine Backend — Tic Tac Toe

**Goal**: Server-authoritative Tic Tac Toe with valid move broadcasting.

**Files**:
- `spacetimedb/src/schema.ts` (MODIFY) — Add `GameState` table
- `spacetimedb/src/games/tic-tac-toe.ts` (NEW) — Pure game logic functions
- `spacetimedb/src/index.ts` (MODIFY) — Add `start_game`, `make_move` reducers

**GameState table** (public): `roomId` (PK), `gameType`, `board` (string/JSON), `currentTurn` (u32), `validMoves` (string/JSON), `status`, `winnerSeat` (optional u32), `moveCount`, `lastMoveAt`

**Anti-cheat**: Server stores board + pre-computed `validMoves`. Client renders only what server provides. `make_move` validates sender identity, correct turn, and move is in valid set.

**Game logic** (pure functions): `initBoard()`, `getValidMoves(board)`, `applyMove(board, pos, player)`, `checkWinner(board)`, `isDraw(board)`

**Verify**: Publish, generate bindings, create room with 2 players, start game, verify GameState row has correct initial state in logs.

---

## Chunk 5: Game UI — Tic Tac Toe Frontend

**Goal**: Render board, show valid moves, play a full game.

**Files**:
- `src/pages/GamePage.svelte` (MODIFY) — Game container with board + chat
- `src/components/games/TicTacToeBoard.svelte` (NEW) — 3x3 grid, clickable valid moves
- `src/components/GameStatus.svelte` (NEW) — Turn indicator, game result

**Key**: Determine "my seat" from RoomMember where `playerIdentity` matches local identity. Only show clickable cells when `currentTurn === mySeat`. Optimistic updates: immediately render piece on click, subscription corrects if needed.

**Verify**: Full game between two browser tabs — alternate turns, win/draw detection, game over screen.

---

## Chunk 6: Local Play Mode

**Goal**: Same-device play using the server (no client-side game logic duplication).

**Files**:
- `spacetimedb/src/index.ts` (MODIFY) — Update `create_room` to support `isLocal` flag; update `make_move` to allow single identity to play both seats in local rooms
- `src/pages/HomePage.svelte` (MODIFY) — "Local" / "Online" choice per game
- `src/pages/GamePage.svelte` (MODIFY) — Local mode: show both seats' turns without identity check
- `src/lib/router.ts` (MODIFY) — No new routes needed; local games use same `#/game/:roomCode`

**Design**: Local games are server-backed rooms where `isLocal=true`. The `create_room` reducer with `isLocal` creates the room, assigns the host to both seats (seatIndex 0 and 1), and immediately starts the game (no lobby phase). The `make_move` reducer skips the identity-to-seat check for local rooms — it just validates the move is valid for the current turn. The UI shows whose turn it is and lets the single user play both sides.

**Flow**: Pick game → "Local" → `create_room({ gameType, isLocal: true })` → navigate to `#/game/:roomCode` → play.

**Verify**: Create local game, play both sides to completion, win/draw detected. "Play Again" creates a new local room.

---

## Chunk 7: Reconnection & Inactivity Cleanup

**Goal**: Graceful disconnect/reconnect + auto-delete inactive rooms.

**Reconnection files**:
- `spacetimedb/src/index.ts` (MODIFY) — `clientDisconnected` sets `online=false` but keeps RoomMember
- `src/Root.svelte` (MODIFY) — Reconnection via stored auth token (already partially done)
- `src/components/ConnectionStatus.svelte` (NEW) — Reconnecting banner

**Reconnection design**: Identity persists via localStorage token. RoomMember rows survive disconnect. On reconnect, subscriptions re-establish and UI shows current state.

**Cleanup files**:
- `spacetimedb/src/schema.ts` (MODIFY) — Add `CleanupJob` scheduled table
- `spacetimedb/src/index.ts` (MODIFY) — Add `run_cleanup` reducer, schedule on room create, reschedule on activity

**Cleanup design**: Schedule cleanup 30 min after last activity. Every room-related reducer calls a `touchRoom()` helper that updates `lastActivity` and reschedules. Finished games clean up after 5 min. `run_cleanup` deletes Room, RoomMembers, ChatMessages, GameState.

**Verify**:
- Start game, close one tab, reopen — player rejoins room and sees current game state
- Create room, verify CleanupJob row exists. Set short timeout for testing, confirm cleanup fires.

---

## Chunk 8: Accessibility

**Goal**: Keyboard navigation, ARIA attributes, screen reader support.

**Files**: All `.svelte` components, `index.html`, `src/lib/a11y.ts` (NEW)

**Key items**:
- Game boards: `role="grid"`, cells `role="gridcell"` with `aria-label`
- Keyboard: Arrow keys for grid navigation, Enter/Space to select
- Live region (`aria-live`) for turn/result announcements
- Chat: `role="log"` with `aria-live="polite"`
- Focus management on page transitions
- Player pieces use shapes/symbols, not just color

**Verify**: Tab through all elements, keyboard-only gameplay, Lighthouse accessibility audit.

---

## Dependency Graph & Order

```
1 (Backend Schema)
├── 2 (Router/Pages)
│   ├── 3 (Room UI)
│   └── 5 (TicTacToe UI) ← also needs 4
│       └── 6 (Local Play)
├── 4 (Game Engine)
├── 7 (Reconnection + Cleanup) ← after 4
└── 8 (Accessibility) ← after all others
```

**Recommended order**: 1 → 2 → 4 → 3 → 5 → 6 → 7 → 8

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
