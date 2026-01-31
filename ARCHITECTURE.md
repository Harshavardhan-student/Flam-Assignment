# Architecture Overview

This document describes the system design and architectural decisions behind
the Real-Time Collaborative Drawing Canvas application.  
The focus is on real-time data flow, state synchronization, and consistency
across multiple users.



 1. Data Flow Diagram

The application follows a client–server model where the server is the
authoritative source of truth.

### Drawing Data Flow

                                              User draws on canvas
                                                           ↓
                                              Client captures pointer events
                                                           ↓
                                              Client renders stroke locally (optimistic rendering)
                                                           ↓
                                              Client sends stroke events via WebSocket
                                                           ↓
                                              Server receives and processes events
                                                           ↓
                                              Server broadcasts events to all connected clients
                                                           ↓
                                              Other clients render the stroke in real time
                                                           ↓
                                                  Canvas State Synchronization
                                                           ↓
                                              Client connects / refreshes
                                                           ↓
                                              Server sends full canvas state
                                                           ↓
                                              Client redraws canvas from stroke history






2. WebSocket Protocol

All communication between clients and the server happens through WebSockets.

 ### Drawing Events

Stroke Start

{
  "type": "stroke:start",
  "strokeId": "uuid",
  "userId": "uuid",
  "color": "#1E88E5",
  "width": 4,
  "tool": "brush",
  "point": { "x": 120, "y": 240 }
}


Stroke point (streamed while drawing)

{
  "type": "stroke:point",
  "strokeId": "uuid",
  "point": { "x": 130, "y": 250 }
}


Stroke end

{
  "type": "stroke:end",
  "stroke": {
    "id": "uuid",
    "userId": "uuid",
    "color": "#1E88E5",
    "width": 4,
    "tool": "brush",
    "points": [...]
  }
}

Canvas State Sync
{
  "type": "canvas:state",
  "strokes": [...]
}

The server sends when :

   1. A client connects or refreshes
   2. Global undo or redo is performed
   3. Canvas is cleared

Undo Events
{ "type": "undo:request" }

Redo Events
{ "type": "redo:request" }


Cursor Updates
{
  "type": "cursor:move",
  "userId": "uuid",
  "name": "User A",
  "color": "#1E88E5",
  "x": 300,
  "y": 200
}






3. Undo / Redo Strategy

  Undo and redo are implemented as global, server-authoritative operations.
  
  Working:-

     1. Client sends an undo or redo request
  
     2. Server updates the global stroke history
  
     3. Server broadcasts the updated canvas state
  
     4. All clients redraw the canvas from the new state
  
     5. server-authoritative
  
     6. Prevents divergence between clients
  
     7. Allows one user to undo another user’s drawing
  
     8. Ensures deterministic ordering of operations
  
     9. Clients never modify stroke history locally.






4. Performance Decisions

       1. Several optimizations were made to ensure smooth real-time performance
   
       2. Optimistic Rendering
   
       3. Clients draw immediately without waiting for server responses
   
       4. Provides low-latency user experience
   
       5. Event Streaming
   
       6. Only incremental stroke points are sent
   
       7. Avoids sending large payloads
   
       8. Stroke-Based State
   
       9. Canvas is represented as structured stroke data instead of pixels
   
       10. Enables efficient redraw and undo/redo
   
       11. Selective Redraw  
   
       12. Full redraw happens only on state changes (undo, redo, refresh)
   
       13. Cursor movement does not trigger canvas redraw






5. Conflict Handling

     1. Simultaneous Drawing
 
     2. Multiple users can draw on the same area at the same time
 
     3. Strokes are applied in the order received by the server
 
     4. Conflict Resolution Strategy
 
     5. Server serializes incoming events
 
     6. Later strokes naturally appear on top of earlier ones
 
     7. No locking is required, keeping the system responsive
 
     8. his approach ensures consistency while allowing free collaboration.
