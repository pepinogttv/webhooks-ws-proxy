# Webhook Relay

Free, zero-friction webhook forwarding to localhost. No installation, no registration — just open your browser.

## How It Works

1. Open the app in your browser
2. You get a unique webhook URL automatically
3. Point your external services (Stripe, MercadoPago, GitHub, etc.) to that URL
4. Webhooks appear in real-time in your browser
5. Configure forwarding rules to route webhooks to your local dev server

The browser uses `fetch()` to forward webhooks directly to `localhost` — no CLI tool or local agent needed.

## Architecture diagram (text-based)

```
External Service → POST /w/{channelId}/path → Server → Socket.IO → Browser → fetch() → localhost
```

## Quick Start

### Local Development
```bash
cd server
npm install
node index.js
# Open http://localhost:3000
```

### Docker
```bash
docker-compose up --build
# Open http://localhost:3000
```

## Forwarding Rules

- **Default Target**: Set a base URL like `http://localhost:3000` — all webhooks will be forwarded preserving their original path
- **Specific Rules**: Map individual webhook paths to specific local URLs
  - Example: `mercadopago/notifications` → `http://localhost:8080/api/webhooks/mp`

All configuration is stored in your browser's localStorage.

## Browser Compatibility

| Browser | Forwarding to localhost | Notes |
|---------|------------------------|-------|
| Chrome | Yes | Shows one-time "Local Network Access" prompt |
| Firefox | Yes | Works out of the box |
| Edge | Yes | Same as Chrome |
| Safari | No | Blocks mixed content to localhost |

## Limitations

- Browser tab must be open for forwarding to work
- Some HTTP headers cannot be forwarded (Host, Cookie, Origin, Content-Length)
- If your local service doesn't have CORS headers, webhooks are sent but the response is opaque (the request still arrives)
- When the tab is closed, up to 50 webhooks are buffered for 30 minutes

## For Best Results

Add CORS headers to your local dev server. Example for Express.js:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});
```

This allows the browser to read the full response from your local service.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| MAX_CHANNELS | 10000 | Max concurrent channels |
| WEBHOOK_BUFFER_SIZE | 50 | Buffered webhooks per channel |
| WEBHOOK_RATE_LIMIT | 60 | Max webhooks/min per channel |
| CHANNEL_IDLE_TTL_HOURS | 24 | Hours before idle channel cleanup |

## Security

- Each channel gets a cryptographically random UUID (122 bits of entropy)
- No channel listing API — you must know the UUID to access a channel
- No accounts, no passwords, no cookies
- Webhook data is transient (in-memory only, not persisted)
- Rate limited: 60 webhooks/min per channel

## License

MIT
