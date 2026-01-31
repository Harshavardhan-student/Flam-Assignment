// `strokes` is the local mirror of the server-authoritative stroke history.
// IMPORTANT: clients must not mutate this array directly when undo/redo
// is handled on the server. All changes to `strokes` come from
// server-sent `canvas:state` messages to avoid desync across clients.
// `strokes` mirrors the server-authoritative history. Clients must not
// mutate this directly for undo/redo correctness.
const strokes = [];
const activeRemoteStrokes = new Map();
let drawCtx = null; // main drawing context used for local tool state

// live cursors for other users: userId -> { x, y, color, name, ts }
const cursors = new Map();
let cursorCtx = null; // overlay canvas context for lightweight cursor drawing

export function initCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  drawCtx = ctx;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 50;
  }

  resize();
  window.addEventListener("resize", resize);
  return ctx;
}

export function initCursorCanvas(canvas) {
  cursorCtx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 50;
    // clear overlay on resize
    cursorCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  resize();
  window.addEventListener("resize", resize);
  return cursorCtx;
}

export function setTool(tool) {
  // For local drawing, set the globalCompositeOperation once when switching tools.
  // This keeps eraser persistent during pointermove and avoids temporary ink.
  if (!drawCtx) return;
  // We use clearRect for rectangular erasing, so keep the drawing composite
  // mode at source-over for predictable behavior. Clearing pixels will be
  // done with clearRect so composite mode leakage is avoided.
  drawCtx.globalCompositeOperation = "source-over";
}

export function setupDrawing(canvas, ctx, getToolState, send) {
  let drawing = false;
  let currentStroke = null;

  canvas.addEventListener("pointerdown", (e) => {
    // require a userId before allowing drawing (wait for server init)
    const toolState = getToolState();
    if (!toolState.userId) return;

    drawing = true;

    const { color, width } = toolState;
    const id = crypto.randomUUID();

    currentStroke = {
      id,
      userId: toolState.userId,
      tool: toolState.tool || "brush",
      color,
      width,
      // eraserSize for eraser strokes; undefined for brush
      size: toolState.tool === "eraser" ? toolState.eraserSize : undefined,
      points: [{ x: e.offsetX, y: e.offsetY }]
    };

    if (currentStroke.tool === "brush") {
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    } else {
      // initial erase square (centered)
      const s = currentStroke.size || 20;
      ctx.clearRect(e.offsetX - s/2, e.offsetY - s/2, s, s);
    }

    send({
      type: "stroke:start",
      strokeId: id,
      color,
      width,
      tool: currentStroke.tool,
      userId: currentStroke.userId,
      // include eraser size so remote clients can apply same rect
      size: currentStroke.size,
      point: { x: e.offsetX, y: e.offsetY }
    });
  });

  canvas.addEventListener("pointermove", (e) => {
    // send cursor move only when we have a userId (after joining)
    const toolState = getToolState();
    if (toolState.userId) send({ type: "cursor:move", userId: toolState.userId, x: e.offsetX, y: e.offsetY });

    if (!drawing) return;

    const point = { x: e.offsetX, y: e.offsetY };
    currentStroke.points.push(point);

    if (currentStroke.tool === "brush") {
      // normal brush stroke
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = currentStroke.color;
      ctx.lineWidth = currentStroke.width;
      ctx.lineCap = "round";
      ctx.stroke();
    } else {
      // rectangular eraser: clear a rectangle centered at cursor
      const s = currentStroke.size || 20;
      ctx.clearRect(point.x - s/2, point.y - s/2, s, s);
    }

    send({
      type: "stroke:point",
      strokeId: currentStroke.id,
      point
    });
  });

  canvas.addEventListener("pointerup", () => {
    if (!drawing) return;
    drawing = false;
    ctx.closePath();
    // DO NOT restore composite here. Composite is controlled by setTool
    // when switching tools so eraser stays consistent until tool change.

    // ❌ DO NOT push locally
    // strokes.push(currentStroke);

    // ✅ SEND FULL STROKE TO SERVER (server stores authoritative history)
    send({ type: "stroke:end", stroke: currentStroke });

    currentStroke = null;
  });
}

export function handleRemoteEvent(ctx, data) {
  const { type, strokeId, color, width, point, tool, userId } = data;

  if (type === "stroke:start") {
    // start a remote stroke; record last point for incremental drawing
    activeRemoteStrokes.set(strokeId, { color, width, tool, userId, last: point, size: data.size });
    // apply initial erase or draw
    if (tool === "eraser") {
      const s = (data.size || 20);
      ctx.clearRect(point.x - s/2, point.y - s/2, s, s);
    } else {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + 0.01, point.y + 0.01);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (type === "stroke:point") {
    const stroke = activeRemoteStrokes.get(strokeId);
    if (!stroke) return;

    if (stroke.tool === "eraser") {
      const s = stroke.size || data.size || 20;
      ctx.clearRect(point.x - s/2, point.y - s/2, s, s);
    } else {
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.last.x, stroke.last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
      stroke.last = point;
    }
  }

  if (type === "stroke:end") {
    // finalize remote stroke; no persistent composite changes were made
    activeRemoteStrokes.delete(strokeId);
  }
}

export function redrawCanvas(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // Replay strokes: use save/restore per stroke so composite settings
  // for erasers do not permanently change the global drawing mode used
  // by the local user. This ensures erased pixels persist while local
  // composite state remains controlled by setTool().
  // Replay strokes in order. For erasers, perform clearRect for each point
  // so erased pixels become transparent on the bitmap. For brush strokes
  // draw the path normally. Using clearRect ensures permanence of erasing.
  strokes.forEach(stroke => {
    if (stroke.tool === "eraser") {
      const s = stroke.size || 20;
      stroke.points.forEach(p => {
        ctx.clearRect(p.x - s/2, p.y - s/2, s, s);
      });
    } else {
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.closePath();
      ctx.restore();
    }
  });

  // cursors are rendered on the overlay canvas; nothing to do here
}

export function replaceCanvasState(ctx, newStrokes) {
  strokes.length = 0;
  newStrokes.forEach(s => strokes.push(s));
  redrawCanvas(ctx);
}

export function updateCursor(userId, x, y, color, name) {
  // store cursor info and render overlay. We render on a separate canvas
  // so cursor updates don't force a redraw of the strokes canvas.
  cursors.set(userId, { x, y, color, name, ts: Date.now() });
  renderCursorsOverlay();
}

function renderCursorsOverlay() {
  if (!cursorCtx) return;

  const c = cursorCtx;
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);

  cursors.forEach((info, id) => {
    if (Date.now() - info.ts > 5000) {
      cursors.delete(id);
      return;
    }

    c.save();
    // draw dot
    c.beginPath();
    c.fillStyle = info.color || "#000";
    c.arc(info.x, info.y, 6, 0, Math.PI * 2);
    c.fill();

    // draw name label slightly offset to avoid overlap
    if (info.name) {
      c.font = "12px sans-serif";
      c.fillStyle = info.color || "#000";
      c.textBaseline = "top";
      c.fillText(info.name, info.x + 10, info.y - 6);
    }

    c.restore();
  });
}
