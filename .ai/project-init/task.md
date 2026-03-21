# Project Init

This is a start of a new application using SpacetimeDB as the backend/db with Svelte as the frontend.

## Goal

The goal is to create a website, where you can easily play turn based games (e.g.: Connect 4, Tic Tac Toe, etc.) against other humans online or locally.

### The game flow

1. Pick an available game from the index page.
2. Choose to play locally or online

If player chooses local game, then the game should start immediately. Otherwise:

3. A new room/lobby is created for the player. On this page, the player gets a link to invite other players. Alternatively, the user can make the lobby public, so other random players can search for open games and join them. Once enough players have joined, the host can start the game.

At this point, a chat window should be available for the users to chat. The chat persists into the game session as well.

4. The game is played until it is finished or the instance is closed due to inactivity.

### Acceptance Criteria

- user can play games locally or online
- cheat protection for online games (the server sends available moves to the client)
- no game logic on the client side
- games are optimistically updated
- completely free for the users
- completely free to host for me (this is a side project, so don't care, if free plan limits are reached)
- app deletes rooms/sessions after a period of inactivity
- app allows users to reconnect after disconnect
- follow accessibility standards

## Non Goals

This list indicates non goals for this project. They might be tackled at a later point, but are not important this early.

- Design. Functionality is prioritized.
- User login
- Highscores system
- i18n system

## Anti-Cheat Strategy

- Fully **server-authoritative** — all move validation happens in reducers only.
- Server pre-calculates and publishes valid moves alongside board state, atomically.
- Client never needs to know the rules — it just renders what the server says is valid.
- This is sufficient for turn-based games. Real-time games would additionally require client-side prediction, which is significantly more complex and out of scope.

## Technologies

- TypeScript everywhere
- Backend / DB: SpacetimeDB
- Frontend: Svelte
- Linting: TypeScript + ESLint
- Formatting: Prettier
