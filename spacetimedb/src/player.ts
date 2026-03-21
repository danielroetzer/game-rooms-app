import { spacetimedb } from "./schema";
import { t, SenderError } from "spacetimedb/server";

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({
      ...existing,
      online: true,
      lastSeen: ctx.timestamp,
    });
  } else {
    ctx.db.player.insert({
      identity: ctx.sender,
      name: "",
      online: true,
      lastSeen: ctx.timestamp,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({
      ...existing,
      online: false,
      lastSeen: ctx.timestamp,
    });
  }
});

export const set_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) throw new SenderError("Player not found");
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new SenderError("Name cannot be empty");
    if (trimmed.length > 32)
      throw new SenderError("Name too long (max 32 characters)");
    ctx.db.player.identity.update({ ...player, name: trimmed });
  },
);
