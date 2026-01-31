import { initCanvas, initCursorCanvas, setupDrawing, handleRemoteEvent, replaceCanvasState, updateCursor, setTool } from "./canvas.js";
import { send, onMessage, onOpen } from "./websocket.js";

const canvas = document.getElementById("canvas");
const cursorCanvas = document.getElementById("cursorCanvas");
const ctx = initCanvas(canvas);
const cursorCtx = initCursorCanvas(cursorCanvas);

const colorPicker = document.getElementById("colorPicker");
const strokeWidth = document.getElementById("strokeWidth");
const eraserSizeEl = document.getElementById("eraserSize");
const brushBtn = document.getElementById("brushBtn");
const eraserBtn = document.getElementById("eraserBtn");
const usersList = document.getElementById("usersList");

let localUserId = null;
let localColor = null;
let localName = null;
let currentTool = "brush";

// disallow client-side color selection; server assigns user color
colorPicker.disabled = true;

// prompt for a display name (no auth). store in localStorage for session convenience
function getLocalName() {
  // prompt for a display name (no auth). Keep name in memory only.
  let name = "";
  while (!name) {
    name = (prompt("Enter display name:") || "").trim();
  }
  return name;
}

function getToolState() {
  return {
    color: colorPicker.value,
    width: strokeWidth.value,
    tool: currentTool,
    userId: localUserId,
    eraserSize: Number(eraserSizeEl.value)
  };
}

setupDrawing(canvas, ctx, getToolState, send);
// ensure initial composite mode matches starting tool
setTool(currentTool);
// send user:join after socket opens
localName = getLocalName();
onOpen(() => {
  send({ type: "user:join", name: localName });
});

onMessage((data) => {
  if (data.type === "canvas:state") {
    replaceCanvasState(ctx, data.strokes);
  } else if (data.type === "user:init") {
    // server accepted join and returned authoritative identity + current state
    localUserId = data.userId;
    localColor = data.color;
    localName = data.name;
    colorPicker.value = localColor;
    colorPicker.disabled = true; // color is server-assigned
    // initialize strokes from server
    if (Array.isArray(data.strokes)) replaceCanvasState(ctx, data.strokes);
  } else if (data.type === "users:update") {
    // render users list
    usersList.innerHTML = "";
    data.users.forEach(u => {
      const el = document.createElement("span");
      el.className = "user";
      const display = u.id === localUserId ? "You" : (u.name || u.id.slice(0,6));
      el.textContent = display;
      el.style.background = u.color;
      usersList.appendChild(el);
    });
  } else if (data.type === "cursor:move") {
    updateCursor(data.userId, data.x, data.y, data.color, data.name);
  } else {
    handleRemoteEvent(ctx, data);
  }
});

// tool button handlers
brushBtn.onclick = () => { currentTool = "brush"; brushBtn.classList.add("active"); eraserBtn.classList.remove("active"); setTool("brush"); };
eraserBtn.onclick = () => { currentTool = "eraser"; eraserBtn.classList.add("active"); brushBtn.classList.remove("active"); setTool("eraser"); };

document.getElementById("undoBtn").onclick = () => {
  send({ type: "undo:request" });
};

document.getElementById("redoBtn").onclick = () => {
  send({ type: "redo:request" });
};

document.getElementById("clearBtn").onclick = () => {
  // Ask server to clear authoritative canvas; server will broadcast empty state
  send({ type: "canvas:clear" });
};
