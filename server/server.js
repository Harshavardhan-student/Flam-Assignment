import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

const app = express();
const server = app.listen(3001, () => {
  console.log("Server running on port 3001");
});

const wss = new WebSocketServer({ server });

const strokes = [];
const redoStack = [];

const users = new Map();

const basePalette = [
  "#E53935", // red
  "#1E88E5", // blue
  "#43A047", // green
  "#FB8C00", // orange
  "#8E24AA", // purple
  "#00897B", // teal
  "#FDD835", // yellow
  "#6D4C41", // brown
  "#3949AB", // indigo
  "#D81B60"  // pink
];

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h*360, s: s*100, l: l*100 };
}

function hslToHex(h,s,l){
  s/=100; l/=100;
  const c = (1 - Math.abs(2*l-1)) * s;
  const x = c * (1 - Math.abs((h/60) % 2 - 1));
  const m = l - c/2;
  let r=0,g=0,b=0;
  if(h<60){ r=c; g=x; b=0; }
  else if(h<120){ r=x; g=c; b=0; }
  else if(h<180){ r=0; g=c; b=x; }
  else if(h<240){ r=0; g=x; b=c; }
  else if(h<300){ r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  const R = Math.round((r+m)*255).toString(16).padStart(2,'0');
  const G = Math.round((g+m)*255).toString(16).padStart(2,'0');
  const B = Math.round((b+m)*255).toString(16).padStart(2,'0');
  return `#${R}${G}${B}`;
}

const expandedPalette = [];
basePalette.forEach(hex => {
  const hsl = hexToHsl(hex);
  // produce a few variants with different lightness levels (avoid extremes)
  [45, 55, 65].forEach(L => {
    expandedPalette.push(hslToHex(hsl.h, Math.max(55, hsl.s), L));
  });
});

function pickColor() {
  // pick first color not currently in use
  const used = new Set(Array.from(users.values()).map(u => u.color));
  for (const c of expandedPalette) {
    if (!used.has(c)) return c;
  }
  // fallback: cycle deterministically through expandedPalette
  return expandedPalette[users.size % expandedPalette.length];
}

wss.on("connection", (ws) => {
  // assign user id and pick a deterministic color from the curated palette
  const userId = randomUUID();
  const color = pickColor();
  users.set(userId, { id: userId, color });
  ws.userId = userId;
  
  broadcastUsers();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "user:join") {
      const name = String(data.name || "").slice(0, 32) || "Anonymous";
      const entry = users.get(ws.userId) || {};
      entry.name = name;
      users.set(ws.userId, entry);

      ws.send(JSON.stringify({ type: "user:init", userId: ws.userId, name: entry.name, color: entry.color, users: Array.from(users.values()), strokes }));
      broadcastUsers();
      return;
    }

    if (data.type && data.type.startsWith("stroke:")) {
      // forward raw stroke messages to all clients for live preview
      wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(msg.toString());
      });

      if (data.type === "stroke:end") {
        // Enforce server-assigned color for stroke
        const user = users.get(ws.userId) || {};
        if (data.stroke) data.stroke.color = user.color || data.stroke.color;
        // Store the completed stroke in the server-authoritative history
        strokes.push(data.stroke);
        // Clear redo buffer on new action
        redoStack.length = 0;
        broadcast();
      }

      return;
    }

    if (data.type === "undo:request") {
      if (!strokes.length) return;
      redoStack.push(strokes.pop());
      broadcast();
      return;
    }

    if (data.type === "redo:request") {
      if (!redoStack.length) return;
      strokes.push(redoStack.pop());
      broadcast();
      return;
    }

    if (data.type === "cursor:move") {
      const user = users.get(data.userId) || {};
      const out = JSON.stringify({
        type: "cursor:move",
        userId: data.userId,
        name: user.name || "",
        x: data.x,
        y: data.y,
        color: user.color || data.color
      });

      wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(out);
      });

      return;
    }

    if (data.type === "canvas:clear") {
      strokes.length = 0;
      redoStack.length = 0;
      broadcast();
      return;
    }
  });

  ws.on("close", () => {
    if (ws.userId) {
      users.delete(ws.userId);
      broadcastUsers();
    }
  });
});

function broadcast() {
  const msg = JSON.stringify({
    type: "canvas:state",
    strokes
  });

  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function broadcastUsers() {
  const list = Array.from(users.values());
  const msg = JSON.stringify({ type: "users:update", users: list });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}
