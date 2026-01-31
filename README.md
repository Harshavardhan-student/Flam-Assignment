# Real-Time Collaborative Drawing Canvas

A real-time, multi-user drawing application where multiple users can draw
simultaneously on a shared canvas and see each other’s actions live.

This project is built using the **raw HTML Canvas API** and **WebSockets**
to demonstrate real-time synchronization, canvas proficiency, and
distributed state management.

---

✨ Features

### Core Features
- Real-time collaborative drawing
- Multiple users drawing simultaneously
- Brush and eraser tools
- Adjustable stroke width
- Multiple colors
- Live cursor indicators
- User names and unique user colors
- Global undo and redo (server-authoritative)
- Canvas state persists across refresh
- Clear canvas button (global)

### Technical Highlights
- Raw HTML Canvas API (no drawing libraries)
- WebSocket-based real-time communication
- Server-authoritative state management
- Optimistic local rendering for smooth UX
- Deterministic redraw from stroke history

---

🧱 Tech Stack

### Frontend
- HTML
- CSS
- Vanilla JavaScript
- HTML Canvas API

### Backend
- Node.js
- WebSocket (`ws`)

---

📁 Project Structure

collaborative-canvas/
├── client/
│ ├── index.html
│ ├── style.css
│ ├── main.js
│ ├── canvas.js
│ └── websocket.js
├── server/
│ └── server.js
├── package.json
├── README.md
└── ARCHITECTURE.md



---

🚀 How to Run the Project

1️⃣ Install dependencies
  npm install

2️⃣ Start the WebSocket server
  npm start

3️⃣ Serve the frontend
  npx serve client

4️⃣ Open the app

  Open the URL shown in the terminal (usually):
  http://localhost:3000