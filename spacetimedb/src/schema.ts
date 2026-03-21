import { schema, table, t } from "spacetimedb/server";

const player = table(
  { name: "player", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    online: t.bool(),
    lastSeen: t.timestamp(),
  },
);

const room = table(
  {
    name: "room",
    public: true,
    indexes: [
      {
        accessor: "room_status",
        algorithm: "btree" as const,
        columns: ["status"],
      },
      {
        accessor: "room_game_type",
        algorithm: "btree" as const,
        columns: ["gameType"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    gameType: t.string(),
    status: t.string(),
    isPublic: t.bool(),
    isLocal: t.bool(),
    hostIdentity: t.identity(),
    maxPlayers: t.u32(),
    createdAt: t.timestamp(),
    lastActivity: t.timestamp(),
  },
);

const roomMember = table(
  {
    name: "room_member",
    public: true,
    indexes: [
      {
        accessor: "room_member_room_id",
        algorithm: "btree" as const,
        columns: ["roomId"],
      },
      {
        accessor: "room_member_player",
        algorithm: "btree" as const,
        columns: ["playerIdentity"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    playerIdentity: t.identity(),
    seatIndex: t.u32(),
    joinedAt: t.timestamp(),
  },
);

const chatMessage = table(
  {
    name: "chat_message",
    public: true,
    indexes: [
      {
        accessor: "chat_message_room_id",
        algorithm: "btree" as const,
        columns: ["roomId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    senderIdentity: t.identity(),
    content: t.string(),
    sentAt: t.timestamp(),
  },
);

export const spacetimedb = schema({ player, room, roomMember, chatMessage });
