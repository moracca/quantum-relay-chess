const http = require("http");
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || "0.0.0.0";

// Serve everything in the repository root (static assets + index.html)
app.use(express.static(__dirname, { extensions: ["html"] }));

// Fallback to index.html for any unmatched route (handy for client-side routing later)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = http.createServer(app);

/* --- WebSocket multiplayer relay --- */
const rooms = new Map();

const genId = () =>
  crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex");

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), players: new Map(), state: null });
  }
  return rooms.get(roomId);
}

function normalizeRoom(input) {
  const fallback = "lobby";
  if (!input) return fallback;
  const trimmed = String(input).trim().slice(0, 64);
  return trimmed || fallback;
}

function assignColor(room) {
  const taken = new Set();
  room.players.forEach((info) => taken.add(info.color));
  if (!taken.has("white")) return "white";
  if (!taken.has("black")) return "black";
  return "spectator";
}

function listPlayers(room) {
  const players = [];
  room.players.forEach((info, client) => {
    players.push({
      name: info.name,
      color: info.color,
      id: info.id,
    });
  });
  return players;
}

function broadcast(room, payload, exceptClient = null) {
  const message = typeof payload === "string" ? payload : JSON.stringify(payload);
  room.clients.forEach((client) => {
    if (client === exceptClient) return;
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.id = genId();
  ws.roomId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      console.warn("Ignoring non-JSON message");
      return;
    }

    if (msg.type === "join") {
      const roomId = normalizeRoom(msg.room);
      const room = getRoom(roomId);
      const name = (msg.name || "Player").toString().slice(0, 64);
      const color = assignColor(room);

      ws.roomId = roomId;
      ws.playerName = name;
      ws.playerColor = color;

      room.clients.add(ws);
      room.players.set(ws, { name, color, id: ws.id });

      ws.send(
        JSON.stringify({
          type: "joined",
          room: roomId,
          clientId: ws.id,
          color,
          players: listPlayers(room),
          state: room.state,
        })
      );

      broadcast(room, { type: "players", players: listPlayers(room) }, ws);
      return;
    }

    if (msg.type === "state") {
      const roomId = ws.roomId || normalizeRoom(msg.room);
      const room = getRoom(roomId);
      room.state = msg.state;
      broadcast(
        room,
        { type: "state", state: msg.state, from: ws.id },
        ws
      );
      return;
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.clients.delete(ws);
    room.players.delete(ws);
    if (room.clients.size === 0) {
      rooms.delete(ws.roomId);
    } else {
      broadcast(room, { type: "players", players: listPlayers(room) });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Quantum Relay Chess server running on http://${HOST}:${PORT}`);
});
