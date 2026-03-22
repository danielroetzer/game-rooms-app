# Game Rooms App — Implementation Checklist

> Reference: `.ai/project-init/plan.md` for architecture context.
> Mark items `[x]` when complete. Document deviations inline.

---

## Chunk 1: Backend Schema — Player, Room, RoomMember, ChatMessage

### 1.1 Create `spacetimedb/src/schema.ts`

- [x] Create `spacetimedb/src/schema.ts` with all table definitions
- [x] Define `Player` table
- [x] Define `Room` table with indexes (`room_status`, `room_game_type`)
- [x] Define `RoomMember` table with indexes (`room_member_room_id`, `room_member_player`)
- [x] Define `ChatMessage` table with index (`chat_message_room_id`)
- [x] Export `schema()` with all four tables
  - **Deviation**: Uses named export (`export const spacetimedb`) plus `export default` (required by SpacetimeDB)

### 1.2 Create reducers and lifecycle hooks

- [x] Split into separate files by context:
  - `player.ts` — lifecycle hooks (`onConnect`, `onDisconnect`) + `set_name` reducer
  - `room.ts` — `generateRoomCode` helper + `create_room`, `join_room`, `leave_room`, `toggle_room_public` reducers
  - `chat.ts` — `send_message` reducer
  - `index.ts` — re-exports from all files + default schema export
- [x] Implement `spacetimedb.clientConnected` (upsert player, set online)
- [x] Implement `spacetimedb.clientDisconnected` (set offline)
- [x] Implement `set_name` reducer (validates non-empty, max 32 chars, trims)
- [x] Implement `generateRoomCode(ctx)` helper
  - Recursive with `ROOM_CODE_CHARS`, `ROOM_CODE_LENGTH`, `ROOM_CODE_MAX_ATTEMPTS` constants
  - Uses `Array.from` + `join` for code generation
  - `ctx` typed via `ReducerCtx<typeof spacetimedb.schemaType>` from `spacetimedb/server`
- [x] Implement `create_room` reducer (validates gameType, inserts room + seat 0, seat 1 if local)
- [x] Implement `join_room` reducer (validates room state, prevents duplicates, assigns next seat)
- [x] Implement `leave_room` reducer (removes member, transfers host or deletes room)
- [x] Implement `toggle_room_public` reducer (host-only, waiting state only)
- [x] Implement `send_message` reducer (validates membership, trims, max 500 chars)

### 1.3 Verify Chunk 1

- [x] Publish: `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [x] Check logs: `spacetime logs game-rooms-app` — all 4 tables created, no errors
- [x] Generate bindings: `pnpm run spacetime:generate`
- [x] Verify `src/module_bindings/index.ts` — all 4 tables and 6 reducers present

---

## Chunk 2: Room Management UI

### 2.1 HomePage — game selection and room creation

- [ ] In `src/routes/+page.svelte`:
  - Show a card/button for "Tic Tac Toe"
  - On click, show options: "Play Online" and "Play Local" (local wired in Chunk 5, disabled for now)
  - "Play Online" calls `createRoom` reducer with `{ gameType: 'tic_tac_toe', isPublic: false, isLocal: false }`
  - After reducer fires, find the newly created room in subscription data (match `hostIdentity` to own identity + most recent), `goto('/lobby/{room.code}')`
  - Show "Join Room" button that opens JoinDialog
  - Show list of public rooms (status `'waiting'`, `isPublic: true`) with "Join" buttons

### 2.2 JoinDialog component

- [ ] Create `src/lib/components/JoinDialog.svelte`:
  - Text input for room code
  - "Join" button calls `joinRoom` reducer with `{ roomCode }`
  - On success, `goto('/lobby/{roomCode}')`
  - Show error if room not found (reducer throws `SenderError`)

### 2.3 LobbyPage — full lobby UI

- [ ] In `src/routes/lobby/[roomCode]/+page.svelte`:
  - Get `roomCode` from `$page.params.roomCode`
  - Use `useTable(tables.room)` to find the room by `roomCode`
  - Use `useTable(tables.roomMember)` filtered by `roomId` for member list
  - Use `useTable(tables.chatMessage)` filtered by `roomId` for chat
  - Show room code prominently with a "Copy Invite Link" button (copies `{window.location.origin}/lobby/{roomCode}`)
  - Show host controls (only if identity matches `hostIdentity`):
    - Toggle public/private button
    - "Start Game" button (disabled until enough players; wired to `start_game` in Chunk 4)
  - Show "Leave Room" button for all players
  - On leave: call `leaveRoom` reducer, `goto('/')`
  - Embed `<MemberList>` and `<Chat>` components

### 2.4 MemberList component

- [ ] Create `src/lib/components/MemberList.svelte`:
  - Props: `members` (RoomMember[]), `players` (Player[])
  - Display each member with their player name (lookup by identity) and seat number
  - Show online/offline indicator per player
  - Show "(Host)" badge next to the host

### 2.5 Chat component

- [ ] Create `src/lib/components/Chat.svelte`:
  - Props: `roomId`, `messages` (ChatMessage[]), `players` (Player[])
  - Display messages sorted by `sentAt`, with sender name
  - Text input + send button at bottom
  - Call `sendMessage` reducer on submit
  - Auto-scroll to bottom on new messages

### 2.6 Verify Chunk 2

- [ ] Create a room from HomePage — navigates to lobby
- [ ] Copy invite link, open in new browser tab
- [ ] Join room from second tab using code — both tabs show 2 members
- [ ] Send chat messages from both tabs — messages appear in both
- [ ] Toggle public — room appears/disappears from public list on HomePage
- [ ] Leave room — redirects to home, member removed from other tab's view

---

## Chunk 3: Game Engine Backend — Tic Tac Toe

### 3.1 Add GameState table to schema

- [ ] In `spacetimedb/src/schema.ts`, add `GameState` table:
  ```ts
  table({ name: 'game_state', public: true }, {
    roomId: t.u64().primaryKey(),   // 1:1 with room, not autoInc
    gameType: t.string(),
    board: t.string(),              // JSON: "[0,0,0,0,0,0,0,0,0]"
    currentTurn: t.u32(),           // seatIndex of current player
    validMoves: t.string(),         // JSON: "[0,1,2,3,4,5,6,7,8]"
    status: t.string(),             // 'in_progress' | 'won' | 'draw'
    winnerSeat: t.u32().optional(), // seatIndex of winner, null if draw/ongoing
    moveCount: t.u32(),
    lastMoveAt: t.timestamp(),
  })
  ```
- [ ] Add `gameState` to the `schema()` call

### 3.2 Create Tic Tac Toe game logic

- [ ] Create `spacetimedb/src/games/tic-tac-toe.ts` with pure functions:
  - `initBoard(): number[]` — returns `[0,0,0,0,0,0,0,0,0]` (0=empty, 1=player0, 2=player1)
  - `getValidMoves(board: number[]): number[]` — returns indices where `board[i] === 0`
  - `applyMove(board: number[], position: number, player: number): number[]` — returns new board with `board[position] = player`
  - `checkWinner(board: number[]): number | null` — checks all 8 lines (3 rows, 3 cols, 2 diags), returns player number (1 or 2) or null
  - `isDraw(board: number[]): boolean` — returns true if no valid moves and no winner
  - All functions are pure, no side effects, safe for reducer use

### 3.3 Add `start_game` reducer

- [ ] Create `spacetimedb/src/game.ts`:
  - Params: `{ roomId: t.u64() }`
  - Validate: room exists, `ctx.sender` is host, status is `'waiting'`
  - Validate: enough members (count via `room_member_room_id.filter(roomId)` >= `maxPlayers`)
  - Import and call `initBoard()` and `getValidMoves()`
  - Insert GameState with initial board and valid moves
  - Update Room status to `'playing'`
  - Update Room `lastActivity`

### 3.4 Add `make_move` reducer

- [ ] In `spacetimedb/src/game.ts`:
  - Params: `{ roomId: t.u64(), position: t.u32() }`
  - Find GameState by roomId
  - Validate: game exists, status is `'in_progress'`
  - **Identity check** (online games only — skip if `room.isLocal`):
    - Find the RoomMember for `ctx.sender`, validate `seatIndex === currentTurn`
  - Validate: `position` is in `validMoves`
  - Apply move, check winner/draw, compute new valid moves
  - Update GameState atomically
  - If game ended: update Room status to `'finished'`

### 3.5 Verify Chunk 3

- [ ] Publish: `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] Check logs: `spacetime logs game-rooms-app` — no errors
- [ ] Generate bindings: `pnpm run spacetime:generate`
- [ ] Verify `src/module_bindings/index.ts` has `gameState` table and `startGame`/`makeMove` reducers

---

## Chunk 4: Game UI — Tic Tac Toe Frontend

### 4.1 GamePage layout

- [ ] In `src/routes/game/[roomCode]/+page.svelte`:
  - Get `roomCode` from `$page.params.roomCode`
  - Use `useTable(tables.room)` to find room by `roomCode`
  - Use `useTable(tables.gameState)` to find game state by `roomId`
  - Use `useTable(tables.roomMember)` filtered by `roomId`
  - Use `useSpacetimeDB()` to get connection state (for identity)
  - Determine `mySeat` from RoomMember identity match
  - Render `<GameStatus>`, `<TicTacToeBoard>`, `<Chat>`
  - Show "Back to Home" link (`<a href="/">`)

### 4.2 TicTacToeBoard component

- [ ] Create `src/lib/components/games/TicTacToeBoard.svelte`:
  - Props: `board`, `validMoves`, `currentTurn`, `mySeat`, `isLocal`, `isMyTurn`, `onMove`
  - Render 3x3 grid, each cell shows empty/X/O
  - Valid moves clickable when it's the player's turn
  - On click: call `onMove(position)`

### 4.3 GameStatus component

- [ ] Create `src/lib/components/GameStatus.svelte`:
  - Props: `status`, `currentTurn`, `winnerSeat`, `mySeat`, `isLocal`, `players`
  - Show turn indicator and game result
  - Show "Play Again" or "Back to Home" when finished

### 4.4 Wire up move handling

- [ ] In game page: call `makeMove({ roomId, position })` on board click
- [ ] Parse `gameState.board` and `gameState.validMoves` from JSON

### 4.5 Wire up "Start Game" in LobbyPage

- [ ] In `src/routes/lobby/[roomCode]/+page.svelte`:
  - Call `startGame({ roomId })` when host clicks "Start Game"
  - Watch room status — when `'playing'`, `goto('/game/{roomCode}')`
  - Non-host players: also auto-navigate on status change

### 4.6 Verify Chunk 4

- [ ] Two tabs: create room → join → start game → both navigate to game
- [ ] Alternate moves — board updates in real-time
- [ ] Win/draw detection works
- [ ] "Back to Home" works

---

## Chunk 5: Local Play Mode

### 5.1 Backend changes for local games

- [ ] In `spacetimedb/src/room.ts`, update `create_room`:
  - When `isLocal`: insert both seats, immediately start game (insert GameState, set status `'playing'`)
- [ ] Verify `make_move` skips identity-to-seat check for local rooms (from Chunk 3.4)

### 5.2 Frontend: enable local play

- [ ] In `src/routes/+page.svelte`: enable "Play Local" button, call `createRoom({ gameType, isPublic: false, isLocal: true })`, `goto('/game/{room.code}')`

### 5.3 Frontend: local game UI adjustments

- [ ] In game page: when `isLocal`, all valid moves are always clickable, show "Player X/O" instead of "Your turn"
- [ ] In `TicTacToeBoard` and `GameStatus`: handle `isLocal` prop

### 5.4 Verify Chunk 5

- [ ] Publish and generate bindings
- [ ] "Play Local" → goes directly to game (no lobby)
- [ ] Play both sides, win/draw works
- [ ] "Play Again" creates new local room

---

## Chunk 6: Reconnection & Inactivity Cleanup

### 6.1 Reconnection — backend

- [ ] Verify `clientDisconnected` sets `online: false` but keeps RoomMember rows

### 6.2 Reconnection — frontend

- [ ] In `src/routes/+layout.svelte`: connection builder already stores/restores token
- [ ] Create `src/lib/components/ConnectionStatus.svelte`:
  - Show banner when `!$conn.isActive`
- [ ] Add `<ConnectionStatus />` to `+layout.svelte`

### 6.3 Cleanup — backend schema

- [ ] Add `CleanupJob` scheduled table to `spacetimedb/src/schema.ts`
  - **Note**: `scheduled` field references a reducer. May need forward reference or co-location with reducer.

### 6.4 Cleanup — backend reducers

- [ ] Add `run_cleanup` reducer (deletes Room, RoomMembers, ChatMessages, GameState)
- [ ] Add `touchRoom(ctx, roomId)` helper (updates `lastActivity`, reschedules cleanup)
- [ ] Call `touchRoom()` from: `create_room`, `join_room`, `leave_room`, `send_message`, `start_game`, `make_move`
- [ ] Shorter cleanup (5 min) when game ends

### 6.5 Verify Chunk 6

- [ ] Publish and generate bindings
- [ ] Reconnection: close tab → reopen → player sees current game state
- [ ] Connection banner appears/disappears on disconnect/reconnect
- [ ] Cleanup job scheduled and fires

---

## Chunk 7: Accessibility

### 7.1 HTML and global setup

- [ ] In `src/app.html`: verify `lang="en"` on `<html>` (already set)
- [ ] Create `src/lib/a11y.ts` with `announce()` function for screen reader live region

### 7.2 Game board accessibility

- [ ] In `TicTacToeBoard.svelte`: `role="grid"`, `aria-label`, roving tabindex, arrow key navigation

### 7.3 Game status announcements

- [ ] In `GameStatus.svelte`: `aria-live="polite"`, announce turn changes and game results

### 7.4 Chat accessibility

- [ ] In `Chat.svelte`: `role="log"`, `aria-live="polite"`, labeled input and button

### 7.5 General accessibility

- [ ] All buttons have descriptive text or `aria-label`
- [ ] Form inputs have associated labels
- [ ] Focus managed on page transitions
- [ ] X and O use distinct shapes, not just color
- [ ] Visible focus indicators

### 7.6 Verify Chunk 7

- [ ] Keyboard-only gameplay
- [ ] Screen reader announces game events
- [ ] Lighthouse accessibility audit — no critical issues

---

## End-to-End Verification

After all chunks complete:

- [ ] `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] `pnpm run spacetime:generate`
- [ ] `pnpm dev`
- [ ] Full online game: two tabs, create → join → chat → play → win/draw
- [ ] Full local game: single tab, create local → play both sides → win/draw
- [ ] Reconnection: disconnect mid-game → reconnect → resume
- [ ] Cleanup: create room → wait → room deleted
- [ ] Accessibility: keyboard-only gameplay, Lighthouse audit
