const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const channels = require('./channels');

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3400;

// --- View engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middleware (order matters!) ---

// Raw body parser for webhook ingestion routes — must come before json/urlencoded
app.use('/w/', express.raw({ type: () => true, limit: '1mb' }));

// Static files (optional)
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---

app.get('/', (req, res) => {
  res.render('index', { channelId: null });
});

app.get('/ch/:channelId', (req, res) => {
  const { channelId } = req.params;
  if (!UUID_V4_RE.test(channelId)) {
    return res.status(400).json({ error: 'Invalid channel ID' });
  }
  res.render('index', { channelId });
});

app.all('/w/:channelId/*', (req, res) => {
  const { channelId } = req.params;

  if (!UUID_V4_RE.test(channelId)) {
    return res.status(400).json({ error: 'Invalid channel ID' });
  }

  if (!channels.checkRateLimit(channelId)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // Everything after /w/{channelId}/
  const prefix = `/w/${channelId}/`;
  const subPath = req.originalUrl.split('?')[0].slice(prefix.length);

  const payload = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    method: req.method,
    path: subPath,
    headers: req.headers,
    rawBodyBase64: req.body && req.body.length > 0 ? req.body.toString('base64') : null,
    query: req.query,
  };

  channels.bufferWebhook(channelId, payload);
  io.to(`channel:${channelId}`).emit('webhook', payload);

  res.status(200).json({ received: true, id: payload.id });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// --- Socket.IO connection rate limiting ---
const connectionTimestamps = new Map();
const MAX_CONNECTIONS_PER_MINUTE = 10;

io.on('connection', (socket) => {
  const ip = socket.handshake.address;
  const now = Date.now();
  const windowStart = now - 60000;

  if (!connectionTimestamps.has(ip)) {
    connectionTimestamps.set(ip, []);
  }

  const timestamps = connectionTimestamps.get(ip).filter((ts) => ts > windowStart);
  connectionTimestamps.set(ip, timestamps);

  if (timestamps.length >= MAX_CONNECTIONS_PER_MINUTE) {
    socket.emit('error', { message: 'Connection rate limit exceeded' });
    socket.disconnect(true);
    return;
  }

  timestamps.push(now);

  // --- join a channel ---
  socket.on('join', ({ channelId }) => {
    if (!channelId || !UUID_V4_RE.test(channelId)) {
      socket.emit('error', { message: 'Invalid channel ID' });
      return;
    }

    const room = `channel:${channelId}`;
    socket.join(room);
    channels.incrementSockets(channelId);

    const buffered = channels.getBuffered(channelId);
    socket.emit('webhook:buffered', buffered);

    const stats = channels.getStats(channelId);
    socket.emit('channel:stats', stats);
  });

  // --- acknowledge buffered webhooks ---
  socket.on('webhook:ack', ({ channelId, lastId }) => {
    if (channelId && lastId != null) {
      channels.clearBuffered(channelId, lastId);
    }
  });

  // --- forward result to other clients in same rooms ---
  socket.on('forward:result', (data) => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit('forward:result', data);
      }
    }
  });

  // --- cleanup on disconnect ---
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('channel:')) {
        const channelId = room.slice('channel:'.length);
        channels.decrementSockets(channelId);
      }
    }
  });
});

// --- Periodic cleanup ---
setInterval(() => {
  channels.cleanup();
}, 5 * 60 * 1000);

// --- Start server ---
server.listen(PORT, () => {
  console.log(`Webhook proxy server running on port ${PORT}`);
});
