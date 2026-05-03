const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// rooms: { code: { clients: Set<ws>, timeout: timeoutId } }
const rooms = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom() {
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));

  rooms.set(code, { clients: new Map(), messageCount: 0 });
  console.log(`Room created: ${code}`);
  return code;
}

function broadcastToRoom(code, message, excludeWs = null) {
  const room = rooms.get(code);
  if (!room) return;
  const data = JSON.stringify(message);
  room.clients.forEach((info, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function resetInactivityTimer(code, ws) {
  const room = rooms.get(code);
  if (!room) return;
  const clientInfo = room.clients.get(ws);
  if (!clientInfo) return;

  // Clear existing timer for this client
  if (clientInfo.timer) clearTimeout(clientInfo.timer);

  // Set new 300s inactivity timer
  clientInfo.timer = setTimeout(() => {
    sendToClient(ws, { type: "kicked", reason: "inactivity" });
    ws.close();
  }, 300000);
}

function removeClientFromRoom(code, ws) {
  const room = rooms.get(code);
  if (!room) return;

  const clientInfo = room.clients.get(ws);
  if (!clientInfo) return;

  // Clear their timer
  if (clientInfo.timer) clearTimeout(clientInfo.timer);

  const nickname = clientInfo.nickname;
  room.clients.delete(ws);

  // Notify others
  broadcastToRoom(code, {
    type: "system",
    text: `${nickname} left the room.`,
    count: room.clients.size,
  });

  // Update member list for remaining
  broadcastRoomInfo(code);

  // Clean up empty room
  if (room.clients.size === 0) {
    rooms.delete(code);
    console.log(`Room ${code} deleted (empty)`);
  }
}

function broadcastRoomInfo(code) {
  const room = rooms.get(code);
  if (!room) return;
  const members = [];
  room.clients.forEach((info) => members.push(info.nickname));
  broadcastToRoom(code, { type: "roomInfo", members, count: members.length });
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let currentNickname = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "createRoom") {
      const code = createRoom();
      currentRoom = code;
      currentNickname = sanitize(msg.nickname) || "Anonymous";

      const room = rooms.get(code);
      room.clients.set(ws, { nickname: currentNickname, timer: null });
      resetInactivityTimer(code, ws);

      sendToClient(ws, { type: "joined", code, nickname: currentNickname });
      broadcastRoomInfo(code);
      console.log(`${currentNickname} created and joined room ${code}`);
    } else if (msg.type === "joinRoom") {
      const code = msg.code?.toUpperCase().trim();
      if (!rooms.has(code)) {
        sendToClient(ws, { type: "error", text: "Room not found. Check the code and try again." });
        return;
      }
      currentRoom = code;
      currentNickname = sanitize(msg.nickname) || "Anonymous";

      const room = rooms.get(code);
      room.clients.set(ws, { nickname: currentNickname, timer: null });
      resetInactivityTimer(code, ws);

      sendToClient(ws, { type: "joined", code, nickname: currentNickname });
      broadcastToRoom(code, {
        type: "system",
        text: `${currentNickname} joined the room.`,
        count: room.clients.size,
      }, ws);
      broadcastRoomInfo(code);
      console.log(`${currentNickname} joined room ${code}`);
    } else if (msg.type === "chat") {
      if (!currentRoom || !rooms.has(currentRoom)) return;

      // Encrypted payload: { iv, ct } — server never sees plaintext
      const iv = msg.iv;
      const ct = msg.ct;
      if (typeof iv !== "string" || typeof ct !== "string") return;
      if (iv.length > 32 || ct.length > 4096) return; // sanity size limits

      // Reset inactivity timer
      resetInactivityTimer(currentRoom, ws);

      const payload = {
        type: "chat",
        nickname: currentNickname,
        iv,
        ct,
        time: new Date().toISOString(),
      };
      // Send to sender too (self flag for bubble alignment)
      sendToClient(ws, { ...payload, self: true });
      broadcastToRoom(currentRoom, payload, ws);
    } else if (msg.type === "leave") {
      if (currentRoom) {
        removeClientFromRoom(currentRoom, ws);
        currentRoom = null;
        currentNickname = null;
      }
      ws.close();
    }
  });

  ws.on("close", () => {
    if (currentRoom) {
      removeClientFromRoom(currentRoom, ws);
    }
  });

  ws.on("error", () => {
    if (currentRoom) {
      removeClientFromRoom(currentRoom, ws);
    }
  });
});

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().slice(0, 200);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
