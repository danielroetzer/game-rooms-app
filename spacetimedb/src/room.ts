import { spacetimedb } from "./schema";
import { t, SenderError, type ReducerCtx } from "spacetimedb/server";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_MAX_ATTEMPTS = 10;

function generateRoomCode(
  ctx: ReducerCtx<typeof spacetimedb.schemaType>,
  attempt = 0,
): string {
  if (attempt >= ROOM_CODE_MAX_ATTEMPTS)
    throw new SenderError("Failed to generate unique room code");

  const code = Array.from(
    { length: ROOM_CODE_LENGTH },
    () =>
      ROOM_CODE_CHARS[ctx.random.integerInRange(0, ROOM_CODE_CHARS.length - 1)],
  ).join("");

  if (ctx.db.room.code.find(code)) {
    return generateRoomCode(ctx, attempt + 1);
  }

  return code;
}

export const create_room = spacetimedb.reducer(
  { gameType: t.string(), isPublic: t.bool(), isLocal: t.bool() },
  (ctx, { gameType, isPublic, isLocal }) => {
    if (gameType !== "tic_tac_toe") {
      throw new SenderError(`Unsupported game type: ${gameType}`);
    }

    const maxPlayers = 2;
    const code = generateRoomCode(ctx);

    const room = ctx.db.room.insert({
      id: 0n,
      code,
      gameType,
      status: "waiting",
      isPublic,
      isLocal,
      hostIdentity: ctx.sender,
      maxPlayers,
      createdAt: ctx.timestamp,
      lastActivity: ctx.timestamp,
    });

    // Host joins as seat 0
    ctx.db.roomMember.insert({
      id: 0n,
      roomId: room.id,
      playerIdentity: ctx.sender,
      seatIndex: 0,
      joinedAt: ctx.timestamp,
    });

    // Local games: same player takes seat 1 as well
    if (isLocal) {
      ctx.db.roomMember.insert({
        id: 0n,
        roomId: room.id,
        playerIdentity: ctx.sender,
        seatIndex: 1,
        joinedAt: ctx.timestamp,
      });
    }
  },
);

export const join_room = spacetimedb.reducer(
  { roomCode: t.string() },
  (ctx, { roomCode }) => {
    const room = ctx.db.room.code.find(roomCode);
    if (!room) throw new SenderError("Room not found");
    if (room.status !== "waiting")
      throw new SenderError("Room is not accepting players");
    if (room.isLocal) throw new SenderError("Cannot join a local game");

    const members = [...ctx.db.roomMember.room_member_room_id.filter(room.id)];

    for (const m of members) {
      if (m.playerIdentity.toHexString() === ctx.sender.toHexString()) {
        throw new SenderError("Already in this room");
      }
    }

    if (members.length >= room.maxPlayers) {
      throw new SenderError("Room is full");
    }

    ctx.db.roomMember.insert({
      id: 0n,
      roomId: room.id,
      playerIdentity: ctx.sender,
      seatIndex: members.length,
      joinedAt: ctx.timestamp,
    });

    ctx.db.room.id.update({ ...room, lastActivity: ctx.timestamp });
  },
);

export const leave_room = spacetimedb.reducer(
  { roomId: t.u64() },
  (ctx, { roomId }) => {
    const room = ctx.db.room.id.find(roomId);
    if (!room) throw new SenderError("Room not found");
    if (room.status !== "waiting")
      throw new SenderError("Cannot leave a room in progress");

    const members = [...ctx.db.roomMember.room_member_room_id.filter(roomId)];
    const myMember = members.find(
      (m) => m.playerIdentity.toHexString() === ctx.sender.toHexString(),
    );
    if (!myMember) throw new SenderError("Not a member of this room");

    ctx.db.roomMember.id.delete(myMember.id);

    const remaining = members.filter((m) => m.id !== myMember.id);

    if (remaining.length === 0) {
      ctx.db.room.id.delete(roomId);
    } else if (room.hostIdentity.toHexString() === ctx.sender.toHexString()) {
      ctx.db.room.id.update({
        ...room,
        hostIdentity: remaining[0].playerIdentity,
        lastActivity: ctx.timestamp,
      });
    } else {
      ctx.db.room.id.update({ ...room, lastActivity: ctx.timestamp });
    }
  },
);

export const toggle_room_public = spacetimedb.reducer(
  { roomId: t.u64() },
  (ctx, { roomId }) => {
    const room = ctx.db.room.id.find(roomId);
    if (!room) throw new SenderError("Room not found");
    if (room.hostIdentity.toHexString() !== ctx.sender.toHexString()) {
      throw new SenderError("Only the host can toggle public/private");
    }
    if (room.status !== "waiting")
      throw new SenderError("Room is not in waiting state");

    ctx.db.room.id.update({ ...room, isPublic: !room.isPublic });
  },
);
