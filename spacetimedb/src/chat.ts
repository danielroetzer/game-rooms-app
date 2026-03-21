import { spacetimedb } from "./schema";
import { t, SenderError } from "spacetimedb/server";

export const send_message = spacetimedb.reducer(
  { roomId: t.u64(), content: t.string() },
  (ctx, { roomId, content }) => {
    const room = ctx.db.room.id.find(roomId);
    if (!room) throw new SenderError("Room not found");

    const members = [...ctx.db.roomMember.room_member_room_id.filter(roomId)];
    const isMember = members.some(
      (m) => m.playerIdentity.toHexString() === ctx.sender.toHexString(),
    );
    if (!isMember) throw new SenderError("Not a member of this room");

    const trimmed = content.trim();
    if (trimmed.length === 0) throw new SenderError("Message cannot be empty");
    if (trimmed.length > 500)
      throw new SenderError("Message too long (max 500 characters)");

    ctx.db.chatMessage.insert({
      id: 0n,
      roomId,
      senderIdentity: ctx.sender,
      content: trimmed,
      sentAt: ctx.timestamp,
    });

    ctx.db.room.id.update({ ...room, lastActivity: ctx.timestamp });
  },
);
