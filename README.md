# Webhook Relay

Free, zero-friction webhook forwarding to localhost through your browser.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Forwarding Rules](#forwarding-rules)
- [Browser Compatibility](#browser-compatibility)
- [Limitations](#limitations)
- [Security](#security)
- [Environment Variables](#environment-variables)
- [Self-Hosting](#self-hosting)
- [License](#license)

---

## Why This Exists

When you develop locally, you often need to receive webhooks from external services like Stripe, MercadoPago, Chatwoot, GitHub, and others. The problem is simple: these services send HTTP requests to a URL, and your `localhost` is not reachable from the internet.

Traditional solutions exist -- ngrok, Cloudflare Tunnel, localtunnel -- but they all require installing a CLI tool or running a local agent on your machine. That is friction you do not need.

Webhook Relay takes a different approach. Instead of tunneling network traffic, it uses your browser as the bridge:

1. The server receives the webhook and pushes it to your browser over a WebSocket connection.
2. Your browser uses `fetch()` to forward the webhook to your local dev server.

The result: **no CLI tool, no local agent, no registration, no accounts**. You open a browser tab and you are done.

---

## How It Works

1. Open Webhook Relay in your browser.
2. You automatically get a unique channel with a webhook base URL like: `https://your-domain.com/w/{channelId}/`
3. Configure your external service (Stripe, MercadoPago, Chatwoot, GitHub, etc.) to send webhooks to that URL. You can append any path you want.
4. Set a **Default Target** (e.g., `http://localhost:4000`) to tell the browser where to forward incoming webhooks.
5. Webhooks arrive in real-time in your browser and get forwarded to your local service.
6. That is it. No CLI, no agent, no registration.

### Architecture

```
External Service (Stripe, Chatwoot, etc.)
  |
  | POST https://your-domain.com/w/{channelId}/chatwoot
  v
Webhook Relay Server (cloud)
  |
  | Socket.IO (real-time)
  v
Your Browser (open tab)
  |
  | fetch("http://localhost:4000/chatwoot")
  v
Your Local Dev Server
```

The server never forwards webhooks directly to your machine. It holds them until a browser client connected to that channel picks them up. The browser does all the forwarding using standard `fetch()` calls to localhost.

---

## Quick Start

### Local Development

```bash
cd server
npm install
node index.js
# Open http://localhost:3400
```

For development with auto-reload:

```bash
cd server
npm run dev
# Open http://localhost:3400
```

### Docker

```bash
docker-compose up --build
# Open http://localhost:3400
```

---

## Forwarding Rules

This section explains how Webhook Relay decides where to send each incoming webhook. Read it carefully -- understanding the forwarding rules is key to using the tool effectively.

### Your Webhook URL

When you open the app, you get a base URL like:

```
https://your-domain.com/w/8d395797-bfaa-4c43-b435-48f1d7c7ba6f/
```

You can append **any path** to this URL when configuring webhooks in external services. For example:

```
https://your-domain.com/w/8d395797-.../chatwoot
https://your-domain.com/w/8d395797-.../mercadopago/notifications
https://your-domain.com/w/8d395797-.../stripe/events
https://your-domain.com/w/8d395797-.../anything/you/want
```

The server accepts **all HTTP methods** (POST, GET, PUT, DELETE, PATCH) on any path under your channel. Query parameters are also preserved and forwarded.

### Default Target (catch-all)

Set a base URL like `http://localhost:4000`. All incoming webhooks get forwarded to that URL, with the original path appended automatically.

**Examples with Default Target = `http://localhost:4000`:**

| Webhook received at | Forwarded to |
|---|---|
| `/w/{id}/chatwoot` | `http://localhost:4000/chatwoot` |
| `/w/{id}/mercadopago/notifications` | `http://localhost:4000/mercadopago/notifications` |
| `/w/{id}/stripe/events` | `http://localhost:4000/stripe/events` |
| `/w/{id}/` (no path) | `http://localhost:4000/` |

This is the simplest setup. One Default Target and you are done. Your local server receives all webhooks on their respective paths, exactly as the external service sent them.

### Specific Rules (overrides)

When you need a webhook path to go to a **different URL** than what the Default Target would produce, add a specific rule.

A rule has two fields:
- **Pattern**: the path to match (e.g., `stripe/events`)
- **Target**: the full URL to forward to (e.g., `http://localhost:5000/webhooks/stripe`)

**Example:** You have Default Target = `http://localhost:4000`, but you want Stripe webhooks to go to a different service running on port 5000:

```
Rule: stripe/events --> http://localhost:5000/webhooks/stripe
```

Now:

| Webhook received at | Forwarded to | Why |
|---|---|---|
| `/w/{id}/chatwoot` | `http://localhost:4000/chatwoot` | Default Target |
| `/w/{id}/stripe/events` | `http://localhost:5000/webhooks/stripe` | Specific Rule (overrides default) |
| `/w/{id}/mercadopago/notifications` | `http://localhost:4000/mercadopago/notifications` | Default Target |

Specific rules always take priority over the Default Target. You can add as many rules as you need.

### Rule Resolution Order

When a webhook arrives, the browser resolves the forwarding target in this order:

1. **Exact match** -- The webhook path matches a rule's pattern exactly. For example, a rule with pattern `stripe/events` matches the webhook path `stripe/events` and nothing else.
2. **Prefix match** -- The webhook path starts with a rule's pattern. For example, a rule with pattern `stripe` would match `stripe/events`, `stripe/checkout`, etc.
3. **Default Target** -- If no specific rule matches, the Default Target is used. The webhook path is appended to the base URL.
4. **No match** -- If there is no Default Target and no matching rule, the webhook is logged in the UI but not forwarded. It appears as "skipped" in the log.

### Configuration Storage

All forwarding rules (Default Target and specific rules) are saved in your browser's `localStorage`. Nothing is stored on the server.

If you clear your browser data, your rules are lost. Your channel ID is also stored in `localStorage`, so clearing it means you will get a new channel on your next visit.

---

## Browser Compatibility

| Browser | Forwarding to localhost | Notes |
|---|---|---|
| Chrome 142+ | Yes | Shows a one-time "Local Network Access" permission prompt. Accept it and you are good. |
| Firefox | Yes | Works out of the box. No extra prompts. |
| Edge | Yes | Same behavior as Chrome (Chromium-based). |
| Safari | View only | Can see webhooks in real-time but CANNOT forward to localhost. Safari blocks mixed content (HTTPS page making HTTP requests to localhost). There is no workaround. |

If you are on Safari, you can still use Webhook Relay to monitor incoming webhooks in real-time. You just cannot forward them. Switch to Chrome, Firefox, or Edge for the full experience.

---

## Limitations

### Browser tab must be open

The forwarding only works while you have the Webhook Relay tab open. If you close it, webhooks are buffered on the server (up to 50 webhooks, for up to 30 minutes). When you reopen the tab, buffered webhooks are delivered and forwarded automatically.

If you have multiple tabs open on the same channel, only one tab will forward each webhook (they coordinate via BroadcastChannel to avoid duplicates).

### Safari cannot forward

Safari blocks HTTP requests from HTTPS pages to localhost. You can still use Webhook Relay in Safari to **view** incoming webhooks in real-time, but they will not be forwarded to your local service. Use Chrome, Firefox, or Edge for full functionality.

### Some HTTP headers cannot be forwarded

Browsers enforce "forbidden headers" that JavaScript cannot set in `fetch()` requests. The following headers from the original webhook are dropped when forwarding:

- `Host`, `Cookie`, `Origin`, `Referer`
- `Connection`, `Content-Length`, `Transfer-Encoding`
- `Keep-Alive`, `Trailer`, `Upgrade`, `Via`, `Expect`, `TE`, `DNT`, `Date`
- All `Sec-*` and `Proxy-*` prefixed headers

Most webhook payloads only rely on `Content-Type`, `Authorization`, and custom `X-*` headers -- all of which **are** forwarded correctly. In practice, this limitation rarely causes issues with real webhook integrations.

### CORS and opaque responses

When your local server does not include CORS headers, the browser still **sends** the request (your server receives the webhook and can process it), but it cannot read the response. The UI shows this as "Sent (opaque response)".

Your webhooks are delivered either way. The only difference is visibility: with CORS headers, you can see the response status code in the Webhook Relay UI. Without them, you see "opaque response" but the webhook still arrives at your server.

To get full visibility, add CORS headers to your local dev server:

```javascript
// Express.js example
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});
```

This is entirely optional. Your webhooks work regardless.

### Chrome Local Network Access prompt

Starting with Chrome 142, the browser shows a one-time permission dialog asking to "connect to devices on your local network". This is a Chrome security feature. Accept it once and it will not ask again for that site.

### Request body fidelity

The original request body is preserved byte-for-byte. The server captures the raw body as a binary buffer, encodes it as base64 for WebSocket transit, and the browser decodes it back to binary before forwarding. JSON, XML, form data, binary payloads -- all arrive at your local server exactly as the external service sent them.

### Maximum payload size

Each webhook payload is limited to 1MB. Webhooks exceeding this size are rejected by the server with a 413 error.

---

## Security

- **Unguessable channel IDs**: Each channel gets a cryptographically random UUID v4 (122 bits of entropy). This is effectively unguessable -- there are more possible UUIDs than atoms in the observable universe.
- **No enumeration**: There is no API to list or discover channels. If you do not know the UUID, you cannot access the channel.
- **No accounts**: No accounts, no passwords, no cookies, no sessions. The channel UUID is the only credential.
- **Transient data**: Webhook data is stored only in server memory, never written to disk. Buffered webhooks expire after 30 minutes.
- **Rate limiting**: 60 webhooks per minute per channel. Exceeding this returns HTTP 429.
- **Connection rate limiting**: 10 WebSocket connections per minute per IP address.
- **Automatic cleanup**: Channels with no connected clients and no activity for 24 hours are automatically removed.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3400` | Port the server listens on |
| `MAX_CHANNELS` | `10000` | Maximum number of concurrent channels |
| `WEBHOOK_BUFFER_SIZE` | `50` | Maximum buffered webhooks per channel (delivered when a client reconnects) |
| `WEBHOOK_RATE_LIMIT` | `60` | Maximum webhooks per minute per channel |
| `CHANNEL_IDLE_TTL_HOURS` | `24` | Hours of inactivity before an idle channel is cleaned up |

---

## Self-Hosting

You can host your own instance of Webhook Relay. The setup is straightforward:

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd webhooks-ws-proxy
   ```

2. Start with Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. Point your domain to the server (port 3400 by default, or configure via the `PORT` environment variable).

4. That is it. Your instance is ready to use.

For production, you will likely want to put a reverse proxy (nginx, Caddy, etc.) in front of the server to handle TLS termination, since browsers need HTTPS to establish secure WebSocket connections from public-facing pages.

---

## License

MIT
