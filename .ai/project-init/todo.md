# Game Rooms App — Implementation Checklist

> Reference: `.ai/project-init/plan.md` for architecture context.
> Mark items `[x]` when complete. Document deviations inline.

---

## Chunk 1: Backend Schema — Player, Room, RoomMember, ChatMessage

### 1.1 Create `spacetimedb/src/schema.ts`

- [ ] Create `spacetimedb/src/schema.ts` with all table definitions
- [ ] Define `Player` table:
  ```ts
  table({ name: 'player', public: true }, {
    identity: t.identity().primaryKey(),
    name: t.string(),
    online: t.bool(),
    lastSeen: t.timestamp(),
  })
  ```
- [ ] Define `Room` table with indexes:
  ```ts
  table({
    name: 'room', public: true,
    indexes: [
      { accessor: 'room_status', algorithm: 'btree', columns: ['status'] },
      { accessor: 'room_game_type', algorithm: 'btree', columns: ['gameType'] },
    ]
  }, {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    gameType: t.string(),       // 'tic_tac_toe'
    status: t.string(),         // 'waiting' | 'playing' | 'finished'
    isPublic: t.bool(),
    isLocal: t.bool(),
    hostIdentity: t.identity(),
    maxPlayers: t.u32(),
    createdAt: t.timestamp(),
    lastActivity: t.timestamp(),
  })
  ```
- [ ] Define `RoomMember` table with indexes:
  ```ts
  table({
    name: 'room_member', public: true,
    indexes: [
      { accessor: 'room_member_room_id', algorithm: 'btree', columns: ['roomId'] },
      { accessor: 'room_member_player', algorithm: 'btree', columns: ['playerIdentity'] },
    ]
  }, {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    playerIdentity: t.identity(),
    seatIndex: t.u32(),
    joinedAt: t.timestamp(),
  })
  ```
- [ ] Define `ChatMessage` table with index:
  ```ts
  table({
    name: 'chat_message', public: true,
    indexes: [
      { accessor: 'chat_message_room_id', algorithm: 'btree', columns: ['roomId'] },
    ]
  }, {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    senderIdentity: t.identity(),
    content: t.string(),
    sentAt: t.timestamp(),
  })
  ```
- [ ] Export `schema()` with all four tables at the bottom of the file:
  ```ts
  const spacetimedb = schema({ player, room, roomMember, chatMessage });
  export default spacetimedb;
  ```

### 1.2 Rewrite `spacetimedb/src/index.ts`

- [ ] Remove all existing code (person table, add/sayHello reducers)
- [ ] Import `spacetimedb` from `./schema` (not from `spacetimedb/server`)
- [ ] Import `{ SenderError }` from `spacetimedb/server`
- [ ] Implement `spacetimedb.clientConnected`:
  - Find player by `ctx.sender` using `ctx.db.player.identity.find(ctx.sender)`
  - If exists: update with `{ ...existing, online: true, lastSeen: ctx.timestamp }`
  - If not: insert `{ identity: ctx.sender, name: '', online: true, lastSeen: ctx.timestamp }`
- [ ] Implement `spacetimedb.clientDisconnected`:
  - Find player by `ctx.sender`, update `online: false`, `lastSeen: ctx.timestamp`
- [ ] Implement `set_name` reducer:
  - Params: `{ name: t.string() }`
  - Find player by `ctx.sender`, throw `SenderError` if not found
  - Validate name is non-empty and reasonable length (e.g., max 32 chars)
  - Update player name: `ctx.db.player.identity.update({ ...existing, name })`
- [ ] Implement helper: `generateRoomCode(ctx)`:
  - Characters: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars like 0/O, 1/I/L)
  - Use `ctx.random.integerInRange(0, chars.length - 1)` to pick 6 characters
  - Check uniqueness via `ctx.db.room.code.find(code)` — regenerate if collision
- [ ] Implement `create_room` reducer:
  - Params: `{ gameType: t.string(), isPublic: t.bool(), isLocal: t.bool() }`
  - Validate `gameType` is supported (`'tic_tac_toe'`)
  - Generate room code using helper
  - Determine `maxPlayers` from gameType (tic_tac_toe = 2)
  - Insert Room: `{ id: 0n, code, gameType, status: 'waiting', isPublic, isLocal, hostIdentity: ctx.sender, maxPlayers, createdAt: ctx.timestamp, lastActivity: ctx.timestamp }`
  - Extract `roomId` from returned row: `const room = ctx.db.room.insert(...); const roomId = room.id;`
  - Insert host as RoomMember seat 0: `{ id: 0n, roomId, playerIdentity: ctx.sender, seatIndex: 0, joinedAt: ctx.timestamp }`
  - If `isLocal`: also insert RoomMember seat 1 with same `ctx.sender`, keep status `'waiting'` (game start happens separately or in same reducer — see Chunk 6)
- [ ] Implement `join_room` reducer:
  - Params: `{ roomCode: t.string() }`
  - Find room by code: `ctx.db.room.code.find(roomCode)`
  - Validate: room exists, status is `'waiting'`, not `isLocal`
  - Check player not already in room (iterate `room_member_room_id.filter(roomId)`)
  - Count current members, validate < `maxPlayers`
  - Assign next seatIndex = current member count
  - Insert RoomMember
  - Update room `lastActivity`
- [ ] Implement `leave_room` reducer:
  - Params: `{ roomId: t.u64() }`
  - Find room, validate exists and status is `'waiting'`
  - Find member by iterating `room_member_room_id.filter(roomId)` for `ctx.sender`
  - Delete the RoomMember row: `ctx.db.roomMember.id.delete(member.id)`
  - If leaving player is host:
    - If other members remain: transfer host to next member, update room
    - If no members remain: delete the room
  - Update room `lastActivity`
- [ ] Implement `toggle_room_public` reducer:
  - Params: `{ roomId: t.u64() }`
  - Find room, validate `ctx.sender` is host and status is `'waiting'`
  - Update `isPublic: !room.isPublic`
- [ ] Implement `send_message` reducer:
  - Params: `{ roomId: t.u64(), content: t.string() }`
  - Validate room exists, player is a member (iterate members to check)
  - Validate content is non-empty and reasonable length (max 500 chars)
  - Insert ChatMessage: `{ id: 0n, roomId, senderIdentity: ctx.sender, content, sentAt: ctx.timestamp }`
  - Update room `lastActivity`

### 1.3 Verify Chunk 1

- [ ] Publish: `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] Check logs: `spacetime logs game-rooms-app` — no errors
- [ ] Generate bindings: `pnpm run spacetime:generate`
- [ ] Verify `src/module_bindings/index.ts` references all new tables and reducers

---

## Chunk 2: Frontend Scaffolding — Router, Pages, Connection

### 2.1 Create hash router

- [ ] Create `src/lib/router.ts`:
  - Export a `createRouter()` function that returns reactive route state
  - Use Svelte 5 `$state` rune for `currentRoute`
  - Parse `window.location.hash` on load and `hashchange` events
  - Support routes: `{ page: 'home' }`, `{ page: 'lobby', roomCode: string }`, `{ page: 'game', roomCode: string }`
  - Export `navigate(hash: string)` helper that sets `window.location.hash`
  - Clean up hashchange listener on destroy

### 2.2 Update `src/Root.svelte`

- [ ] Change `DB_NAME` default from `'svelte-ts'` to `'game-rooms-app'`
- [ ] Add `subscribeToAll()` call in `onConnect` callback:
  ```ts
  const onConnect = (conn: DbConnection, identity: Identity, token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    conn.subscriptionBuilder().subscribeToAll();
  };
  ```

### 2.3 Rewrite `src/App.svelte`

- [ ] Remove all placeholder person-table UI
- [ ] Import and initialize router
- [ ] Render page based on current route:
  - `'home'` → `<HomePage />`
  - `'lobby'` → `<LobbyPage roomCode={route.roomCode} />`
  - `'game'` → `<GamePage roomCode={route.roomCode} />`
  - Default fallback → redirect to home

### 2.4 Create page stubs

- [ ] Create `src/pages/HomePage.svelte` — simple heading "Game Rooms" + placeholder text
- [ ] Create `src/pages/LobbyPage.svelte` — accepts `roomCode` prop, shows "Lobby: {roomCode}"
- [ ] Create `src/pages/GamePage.svelte` — accepts `roomCode` prop, shows "Game: {roomCode}"

### 2.5 Verify Chunk 2

- [ ] Run `pnpm dev` — app loads at `#/` showing HomePage
- [ ] Manually navigate to `#/lobby/ABC123` — shows LobbyPage stub
- [ ] Manually navigate to `#/game/ABC123` — shows GamePage stub
- [ ] Console shows "Connected to SpacetimeDB" with identity
- [ ] No errors in browser console

---

## Chunk 3: Room Management UI

### 3.1 HomePage — game selection and room creation

- [ ] In `src/pages/HomePage.svelte`:
  - Show a card/button for "Tic Tac Toe"
  - On click, show options: "Play Online" and "Play Local" (local wired in Chunk 6, disabled for now)
  - "Play Online" calls `createRoom` reducer with `{ gameType: 'tic_tac_toe', isPublic: false, isLocal: false }`
  - After reducer fires, find the newly created room in subscription data (match `hostIdentity` to own identity + most recent), navigate to `#/lobby/{room.code}`
  - Show "Join Room" button that opens JoinDialog
  - Show list of public rooms (status `'waiting'`, `isPublic: true`) with "Join" buttons

### 3.2 JoinDialog component

- [ ] Create `src/components/JoinDialog.svelte`:
  - Text input for room code
  - "Join" button calls `joinRoom` reducer with `{ roomCode }`
  - On success, navigate to `#/lobby/{roomCode}`
  - Show error if room not found (reducer throws `SenderError`)

### 3.3 LobbyPage — full lobby UI

- [ ] In `src/pages/LobbyPage.svelte`:
  - Use `useTable(tables.room)` to find the room by `roomCode`
  - Use `useTable(tables.roomMember)` filtered by `roomId` for member list
  - Use `useTable(tables.chatMessage)` filtered by `roomId` for chat
  - Show room code prominently with a "Copy Invite Link" button (copies `{window.location.origin}/#/lobby/{roomCode}`)
  - Show host controls (only if `ctx.sender` matches `hostIdentity`):
    - Toggle public/private button
    - "Start Game" button (disabled until enough players; wired to `start_game` in Chunk 5)
  - Show "Leave Room" button for all players
  - On leave: call `leaveRoom` reducer, navigate to `#/`
  - Embed `<MemberList>` and `<Chat>` components

### 3.4 MemberList component

- [ ] Create `src/components/MemberList.svelte`:
  - Props: `members` (RoomMember[]), `players` (Player[])
  - Display each member with their player name (lookup by identity) and seat number
  - Show online/offline indicator per player
  - Show "(Host)" badge next to the host

### 3.5 Chat component

- [ ] Create `src/components/Chat.svelte`:
  - Props: `roomId`, `messages` (ChatMessage[]), `players` (Player[])
  - Display messages sorted by `sentAt`, with sender name
  - Text input + send button at bottom
  - Call `sendMessage` reducer on submit
  - Auto-scroll to bottom on new messages

### 3.6 Verify Chunk 3

- [ ] Create a room from HomePage — navigates to lobby
- [ ] Copy invite link, open in new browser tab
- [ ] Join room from second tab using code — both tabs show 2 members
- [ ] Send chat messages from both tabs — messages appear in both
- [ ] Toggle public — room appears/disappears from public list on HomePage
- [ ] Leave room — redirects to home, member removed from other tab's view

---

## Chunk 4: Game Engine Backend — Tic Tac Toe

### 4.1 Add GameState table to schema

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

### 4.2 Create Tic Tac Toe game logic

- [ ] Create `spacetimedb/src/games/tic-tac-toe.ts` with pure functions:
  - `initBoard(): number[]` — returns `[0,0,0,0,0,0,0,0,0]` (0=empty, 1=player0, 2=player1)
  - `getValidMoves(board: number[]): number[]` — returns indices where `board[i] === 0`
  - `applyMove(board: number[], position: number, player: number): number[]` — returns new board with `board[position] = player`
  - `checkWinner(board: number[]): number | null` — checks all 8 lines (3 rows, 3 cols, 2 diags), returns player number (1 or 2) or null
  - `isDraw(board: number[]): boolean` — returns true if no valid moves and no winner
  - All functions are pure, no side effects, safe for reducer use

### 4.3 Add `start_game` reducer

- [ ] In `spacetimedb/src/index.ts`:
  - Params: `{ roomId: t.u64() }`
  - Validate: room exists, `ctx.sender` is host, status is `'waiting'`
  - Validate: enough members (count via `room_member_room_id.filter(roomId)` >= `maxPlayers`)
  - Import and call `initBoard()` and `getValidMoves()`
  - Insert GameState: `{ roomId, gameType: room.gameType, board: JSON.stringify(initBoard()), currentTurn: 0, validMoves: JSON.stringify(getValidMoves(initBoard())), status: 'in_progress', winnerSeat: undefined, moveCount: 0, lastMoveAt: ctx.timestamp }`
  - Update Room status to `'playing'`
  - Update Room `lastActivity`

### 4.4 Add `make_move` reducer

- [ ] In `spacetimedb/src/index.ts`:
  - Params: `{ roomId: t.u64(), position: t.u32() }`
  - Find GameState by roomId: `ctx.db.gameState.roomId.find(roomId)`
  - Validate: game exists, status is `'in_progress'`
  - Find room: validate it exists
  - **Identity check** (online games only — skip if `room.isLocal`):
    - Find the RoomMember for `ctx.sender` in this room
    - Validate their `seatIndex === gameState.currentTurn`
  - Parse board: `JSON.parse(gameState.board) as number[]`
  - Parse validMoves: `JSON.parse(gameState.validMoves) as number[]`
  - Validate: `position` is in `validMoves`
  - Apply move: `applyMove(board, position, currentTurn === 0 ? 1 : 2)`
  - Check winner: `checkWinner(newBoard)`
  - Check draw: `isDraw(newBoard)`
  - Compute new valid moves: `getValidMoves(newBoard)`
  - Determine new status: `winner ? 'won' : draw ? 'draw' : 'in_progress'`
  - Determine next turn: `(gameState.currentTurn + 1) % 2` (only matters if game continues)
  - Update GameState: `ctx.db.gameState.roomId.update({ ...gameState, board: JSON.stringify(newBoard), currentTurn: nextTurn, validMoves: JSON.stringify(newValidMoves), status: newStatus, winnerSeat: winner ? gameState.currentTurn : undefined, moveCount: gameState.moveCount + 1, lastMoveAt: ctx.timestamp })`
  - If game ended (`'won'` or `'draw'`): update Room status to `'finished'`
  - Update Room `lastActivity`

### 4.5 Verify Chunk 4

- [ ] Publish: `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] Check logs: `spacetime logs game-rooms-app` — no errors
- [ ] Generate bindings: `pnpm run spacetime:generate`
- [ ] Verify `src/module_bindings/index.ts` has `gameState` table and `startGame`/`makeMove` reducers

---

## Chunk 5: Game UI — Tic Tac Toe Frontend

### 5.1 GamePage layout

- [ ] In `src/pages/GamePage.svelte`:
  - Use `useTable(tables.room)` to find room by `roomCode` prop
  - Use `useTable(tables.gameState)` to find game state by `roomId`
  - Use `useTable(tables.roomMember)` filtered by `roomId`
  - Use `useSpacetimeDB()` to get connection state (for identity)
  - Determine `mySeat`: find RoomMember where `playerIdentity.toHexString() === $conn.identity?.toHexString()`, get `seatIndex`
  - Determine `isLocal` from room data
  - Render `<GameStatus>` at top
  - Render `<TicTacToeBoard>` in center
  - Render `<Chat>` (from Chunk 3) alongside/below the board
  - Show "Back to Home" link

### 5.2 TicTacToeBoard component

- [ ] Create `src/components/games/TicTacToeBoard.svelte`:
  - Props: `board` (number[], parsed from JSON), `validMoves` (number[], parsed from JSON), `currentTurn` (number), `mySeat` (number | null), `isLocal` (boolean), `isMyTurn` (boolean), `onMove` (callback)
  - Render 3x3 grid
  - Each cell shows: empty, X (player 1/seat 0), or O (player 2/seat 1)
  - Cells that are in `validMoves` AND it's the player's turn are clickable
  - `isMyTurn` logic: for online games `currentTurn === mySeat`, for local games always true
  - On click: call `onMove(position)`
  - Visual feedback: highlight valid moves, indicate current turn

### 5.3 GameStatus component

- [ ] Create `src/components/GameStatus.svelte`:
  - Props: `status`, `currentTurn`, `winnerSeat`, `mySeat`, `isLocal`, `players` (member names by seat)
  - Show whose turn it is: "Your turn" / "Opponent's turn" / "Player X's turn" (local)
  - Show game result: "You win!" / "You lose!" / "Draw!" / "Player X wins!" (local)
  - Show "Play Again" or "Back to Home" buttons when game is finished

### 5.4 Wire up move handling in GamePage

- [ ] In `src/pages/GamePage.svelte`:
  - Get `makeMove` reducer via `useReducer(reducers.makeMove)`
  - On board cell click: call `makeMove({ roomId: room.id, position })` where position is the cell index (0-8)
  - Parse `gameState.board` and `gameState.validMoves` from JSON strings before passing to board component

### 5.5 Wire up "Start Game" in LobbyPage

- [ ] In `src/pages/LobbyPage.svelte`:
  - Get `startGame` reducer via `useReducer(reducers.startGame)`
  - When host clicks "Start Game": call `startGame({ roomId: room.id })`
  - Watch room status — when it changes to `'playing'`, navigate to `#/game/{roomCode}`
  - Non-host players: also watch room status and auto-navigate to game page

### 5.6 Verify Chunk 5

- [ ] Open two browser tabs
- [ ] Tab 1: Create room → go to lobby
- [ ] Tab 2: Join room via code → both see 2 members
- [ ] Tab 1 (host): Click "Start Game" → both navigate to game page
- [ ] Alternate moves between tabs — board updates in real-time
- [ ] Play to a win → game over screen shown in both tabs
- [ ] Play to a draw → draw screen shown
- [ ] "Back to Home" works

---

## Chunk 6: Local Play Mode

### 6.1 Backend changes for local games

- [ ] In `spacetimedb/src/index.ts`, update `create_room` reducer:
  - When `isLocal` is true:
    - Insert host as seat 0 AND seat 1 (two RoomMember rows, same identity)
    - Immediately call game start logic inline (or call into `start_game`'s logic):
      - Insert GameState with initial board
      - Set room status to `'playing'`
    - This means local games skip the lobby entirely
- [ ] Verify `make_move` already skips identity-to-seat check when `room.isLocal` is true (added in Chunk 4.4)

### 6.2 Frontend: enable local play button

- [ ] In `src/pages/HomePage.svelte`:
  - Enable the "Play Local" button (was disabled placeholder)
  - On click: call `createRoom({ gameType: 'tic_tac_toe', isPublic: false, isLocal: true })`
  - After room is created, navigate directly to `#/game/{room.code}` (skip lobby)

### 6.3 Frontend: local game UI adjustments

- [ ] In `src/pages/GamePage.svelte`:
  - When `isLocal` is true:
    - Don't restrict moves to "my seat" — all moves are allowed
    - Show turn as "Player X's turn" / "Player O's turn" instead of "Your turn"
  - Pass `isLocal` prop to `TicTacToeBoard` and `GameStatus`
- [ ] In `TicTacToeBoard`: when `isLocal`, all valid-move cells are always clickable
- [ ] In `GameStatus`: when `isLocal`, show "Player X" / "Player O" instead of "You" / "Opponent"

### 6.4 Verify Chunk 6

- [ ] Publish backend: `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] Generate bindings: `pnpm run spacetime:generate`
- [ ] Click "Play Local" on home page — goes directly to game (no lobby)
- [ ] Play both sides — moves alternate correctly
- [ ] Win/draw detection works
- [ ] "Play Again" creates a new local room and navigates there

---

## Chunk 7: Reconnection & Inactivity Cleanup

### 7.1 Reconnection — backend

- [ ] In `spacetimedb/src/index.ts`, verify `clientDisconnected`:
  - Sets `online: false` on Player but does NOT delete RoomMember rows
  - This is already the behavior from Chunk 1 — confirm it's correct

### 7.2 Reconnection — frontend

- [ ] In `src/Root.svelte`:
  - The connection builder already stores/restores token from localStorage
  - Verify that on reconnect, subscriptions re-establish (SpacetimeDB SDK handles this)
  - Add `onDisconnect` handling: log and let SDK auto-reconnect
- [ ] Create `src/components/ConnectionStatus.svelte`:
  - Use `useSpacetimeDB()` to get `$conn.isActive`
  - When `!$conn.isActive`: show a banner at top of page: "Connection lost. Reconnecting..."
  - When `$conn.isActive`: hide banner
- [ ] Add `<ConnectionStatus />` to `App.svelte` (rendered above page content)

### 7.3 Cleanup — backend schema

- [ ] In `spacetimedb/src/schema.ts`, add `CleanupJob` scheduled table:
  ```ts
  // Note: scheduled table references the reducer — define reducer first, then table
  // Use forward reference: scheduled: () => run_cleanup
  table({
    name: 'cleanup_job',
    scheduled: () => run_cleanup,  // from index.ts — needs circular ref handling
  }, {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roomId: t.u64(),
  })
  ```
  - **Important**: The `scheduled` field references a reducer. This may require the reducer to be defined in the same file or using a forward reference pattern. If circular import issues arise, move the scheduled table + reducer to `index.ts` and keep non-scheduled tables in `schema.ts`.
- [ ] Add `cleanupJob` to the `schema()` call

### 7.4 Cleanup — backend reducers

- [ ] In `spacetimedb/src/index.ts`, add `run_cleanup` reducer:
  - Receives the full `CleanupJob` row as `arg`
  - Find room by `arg.roomId`
  - If room doesn't exist: return (already cleaned up)
  - Delete all RoomMembers for this room (iterate `room_member_room_id.filter(roomId)`, delete each)
  - Delete all ChatMessages for this room (iterate `chat_message_room_id.filter(roomId)`, delete each)
  - Delete GameState if exists: `ctx.db.gameState.roomId.delete(roomId)`
  - Delete the Room: `ctx.db.room.id.delete(roomId)`
- [ ] Add `touchRoom(ctx, roomId)` helper function:
  - Find room, update `lastActivity: ctx.timestamp`
  - Find existing cleanup job for this room (iterate `ctx.db.cleanupJob.iter()` looking for matching `roomId`)
  - If found: delete it
  - Schedule new cleanup job 30 min from now:
    ```ts
    import { ScheduleAt } from 'spacetimedb';
    const thirtyMin = 30n * 60n * 1_000_000n; // 30 min in microseconds
    const futureTime = ctx.timestamp.microsSinceUnixEpoch + thirtyMin;
    ctx.db.cleanupJob.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(futureTime), roomId });
    ```
- [ ] Call `touchRoom()` from: `create_room`, `join_room`, `leave_room`, `send_message`, `start_game`, `make_move`
- [ ] In `make_move`: when game ends (`'won'` or `'draw'`), schedule shorter cleanup (5 min instead of 30)

### 7.5 Verify Chunk 7

- [ ] Publish: `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] Generate bindings: `pnpm run spacetime:generate`
- [ ] **Reconnection**: Start a game → close one tab → reopen → player sees current game state
- [ ] **Connection banner**: Disconnect network briefly → banner appears → reconnects → banner disappears
- [ ] **Cleanup**: Create a room → check `spacetime logs` for scheduled cleanup job → (optionally set short timeout to verify it fires)

---

## Chunk 8: Accessibility

### 8.1 HTML and global setup

- [ ] In `index.html`: add `lang="en"` to `<html>` tag
- [ ] Create `src/lib/a11y.ts`:
  - Export `announce(message: string)` function that sets text in a live region for screen readers
  - Uses a hidden `<div aria-live="assertive">` element (create it on first call or in app init)

### 8.2 Game board accessibility

- [ ] In `TicTacToeBoard.svelte`:
  - Add `role="grid"` to the board container, `aria-label="Tic Tac Toe board"`
  - Each row: `role="row"`
  - Each cell: `role="gridcell"`, `aria-label="Row {r}, Column {c}, {state}"` where state is "empty" / "X" / "O"
  - Valid move cells: `aria-label` includes ", available move"
  - Keyboard navigation: arrow keys move focus between cells, Enter/Space to select
  - `tabindex="0"` on the focused cell, `tabindex="-1"` on others (roving tabindex)

### 8.3 Game status announcements

- [ ] In `GameStatus.svelte`:
  - Use `aria-live="polite"` on the status region
  - Call `announce()` when turn changes or game ends
  - Ensure game result is communicated to screen readers

### 8.4 Chat accessibility

- [ ] In `Chat.svelte`:
  - Message list: `role="log"`, `aria-live="polite"`, `aria-label="Chat messages"`
  - Input: `aria-label="Type a message"`
  - Send button: `aria-label="Send message"`

### 8.5 General accessibility

- [ ] All buttons have descriptive text or `aria-label`
- [ ] Form inputs have associated labels
- [ ] Focus is managed on page transitions (focus main heading on navigate)
- [ ] Color is not the only differentiator — X and O are distinct shapes
- [ ] Interactive elements have visible focus indicators

### 8.6 Verify Chunk 8

- [ ] Tab through all pages — every interactive element is reachable
- [ ] Navigate game board with keyboard only — arrow keys + Enter
- [ ] Screen reader announces turn changes and game results
- [ ] Run Lighthouse accessibility audit — target no critical issues

---

## End-to-End Verification

After all chunks complete:

- [ ] `spacetime publish game-rooms-app --clear-database -y --module-path spacetimedb`
- [ ] `pnpm run spacetime:generate`
- [ ] `pnpm dev`
- [ ] Full online game: two tabs, create → join → chat → play → win/draw
- [ ] Full local game: single tab, create local → play both sides → win/draw
- [ ] Reconnection: disconnect mid-game → reconnect → resume
- [ ] Cleanup: create room → wait (or use short timeout) → room deleted
- [ ] Accessibility: keyboard-only gameplay, Lighthouse audit
