// Simple WebSocket signaling server example.
// Run with: node signaling-server.js
// This is intentionally tiny and meant for local testing only.

const WebSocket = require('ws');

const DEFAULT_START = parseInt(process.env.PORT || process.argv[2], 10) || 8080;
const MAX_PORT = DEFAULT_START + 100;

function startServer(startPort) {
  let port = startPort;
  function tryPort(p) {
    try {
      const wss = new WebSocket.Server({ port: p });

      wss.on('listening', () => {
        console.log('Signaling server listening on port', p);
      });

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

      wss.on('error', (err) => {
        console.error('WebSocket server error on port', p, err);
      });

      return true;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.warn('Port', p, 'in use, trying next port');
        if (p + 1 <= MAX_PORT) return tryPort(p + 1);
        console.error('No available ports between', startPort, 'and', MAX_PORT);
        process.exit(1);
      }
      console.error('Failed to start signaling server:', err);
      process.exit(1);
    }
  }

  tryPort(port);
}

startServer(DEFAULT_START);
