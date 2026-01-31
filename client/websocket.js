const socket = new WebSocket("ws://localhost:3001");

export function send(data) {
  socket.send(JSON.stringify(data));
}

export function onMessage(handler) {
  socket.onmessage = async (event) => {
    let data;
    if (event.data instanceof Blob) {
      data = JSON.parse(await event.data.text());
    } else {
      data = JSON.parse(event.data);
    }
    handler(data);
  };
}

export function onOpen(handler) {
  socket.onopen = () => handler();
}
