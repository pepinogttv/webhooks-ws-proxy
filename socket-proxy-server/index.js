const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");
const { requireAuth, socketAuth, validateSecret, API_SECRET } = require("./auth");
const endpointsModule = require("./endpoints");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 10e6, // 10MB - match raw body limit
});

// --- State ---
const activityLog = [];
const MAX_LOG_SIZE = 100;
let connectedClients = 0;

// --- Middleware ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Capture raw body as Buffer for webhook routes (ALL content types: JSON, XML, text, binary, etc.)
// This runs BEFORE the global parsers, so webhook bodies are preserved as exact raw bytes
app.use("/webhooks", express.raw({ type: () => true, limit: "10mb" }));

// Normal parsing for non-webhook routes (login, API, dashboard)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: API_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

// --- Dynamic webhook router ---
function createWebhookRouter() {
  const router = express.Router();
  const endpoints = endpointsModule.getAll();

  endpoints.forEach((endpoint) => {
    router[endpoint.method](endpoint.path, (req, res) => {
      // req.body is a raw Buffer from express.raw() middleware
      const rawBody =
        Buffer.isBuffer(req.body) && req.body.length > 0
          ? req.body.toString("base64")
          : null;

      const payload = {
        headers: req.headers,
        rawBody,
        params: req.params,
        query: req.query,
        method: req.method, // actual HTTP method (GET, POST, PUT, etc.)
      };

      const logEntry = {
        timestamp: new Date().toISOString(),
        path: endpoint.path,
        method: endpoint.method.toUpperCase(),
        key: endpoint.key,
      };
      activityLog.unshift(logEntry);
      if (activityLog.length > MAX_LOG_SIZE) activityLog.pop();

      io.emit(endpoint.path, payload);
      io.emit("webhook:received", logEntry);

      res.json({ received: true });
    });
  });

  return router;
}

let webhookRouter = createWebhookRouter();
app.use("/webhooks", (req, res, next) => webhookRouter(req, res, next));

// --- Auth routes ---
app.get("/login", (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { secret } = req.body;
  if (validateSecret(secret)) {
    req.session.authenticated = true;
    return res.redirect("/");
  }
  res.render("login", { error: "Secret incorrecto" });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// --- Dashboard ---
app.get("/", requireAuth, (req, res) => {
  const endpoints = endpointsModule.getAll();
  res.render("dashboard", {
    endpoints,
    connectedClients,
    activityLog: activityLog.slice(0, 20),
  });
});

// --- API routes (protected) ---
app.get("/api/endpoints", requireAuth, (req, res) => {
  res.json(endpointsModule.getAll());
});

app.post("/api/endpoints", requireAuth, (req, res) => {
  try {
    const { path: ePath, method, key } = req.body;
    if (!ePath || !method || !key) {
      return res.status(400).json({ error: "path, method, and key are required" });
    }
    const endpoint = endpointsModule.create({ path: ePath, method, key });
    webhookRouter = createWebhookRouter();
    io.emit("endpoints:updated", endpointsModule.getAll());
    res.json(endpoint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/endpoints/:key", requireAuth, (req, res) => {
  try {
    const endpoint = endpointsModule.update(req.params.key, req.body);
    webhookRouter = createWebhookRouter();
    io.emit("endpoints:updated", endpointsModule.getAll());
    res.json(endpoint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/endpoints/:key", requireAuth, (req, res) => {
  try {
    const removed = endpointsModule.remove(req.params.key);
    webhookRouter = createWebhookRouter();
    io.emit("endpoints:updated", endpointsModule.getAll());
    res.json(removed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Public endpoint for socket clients to fetch endpoints list
app.get("/endpoints", (req, res) => {
  res.json(endpointsModule.getAll());
});

app.get("/api/status", requireAuth, (req, res) => {
  res.json({
    connectedClients,
    endpointsCount: endpointsModule.getAll().length,
    recentActivity: activityLog.slice(0, 10),
  });
});

// --- Socket.IO ---
io.use(socketAuth);

io.on("connection", (socket) => {
  connectedClients++;
  console.log(`Client connected (total: ${connectedClients})`);
  io.emit("clients:count", connectedClients);

  socket.on("disconnect", () => {
    connectedClients--;
    console.log(`Client disconnected (total: ${connectedClients})`);
    io.emit("clients:count", connectedClients);
  });
});

// --- Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Webhooks base: http://localhost:${PORT}/webhooks`);
});
