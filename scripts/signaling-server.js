// Simple WebSocket signaling server example.
// Run with: node signaling-server.js
// This is intentionally tiny and meant for local testing only.

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

console.log('Signaling server listening on port', port);

wss.on('connection', function connection(ws) {
  console.log('Client connected');
  ws.on('message', function incoming(message) {
    // Broadcast to all other clients
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
  ws.on('close', function() {
    console.log('Client disconnected');
  });
});
