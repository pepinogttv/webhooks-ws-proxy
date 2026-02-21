const socketIoClient = require("socket.io-client");
const axios = require("axios");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");
const endpointsMapper = require("./endpointsMap");

const app = express();

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const API_SECRET = process.env.API_SECRET;

if (!API_SECRET) {
  console.error("ERROR: API_SECRET environment variable is required");
  process.exit(1);
}

// --- State ---
const forwardLog = [];
const MAX_LOG_SIZE = 50;
let socketConnected = false;

// --- Socket.IO connection with auth ---
const socket = socketIoClient(SERVER_URL, {
  auth: { token: API_SECRET },
  reconnection: true,
  reconnectionDelay: 3000,
});

// --- Middleware ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());
app.use(
  session({
    secret: API_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.headers.accept && req.headers.accept.includes("text/html")) {
    return res.redirect("/login");
  }
  return res.status(401).json({ error: "Unauthorized" });
}

// --- Helper ---
function buildUrl(baseUrl, query = {}) {
  const url = new URL(baseUrl);
  Object.keys(query).forEach((key) => {
    url.searchParams.append(key, query[key]);
  });
  return url.toString();
}

// --- Socket.IO event handling ---
function registerEndpoints(endpoints) {
  endpoints.forEach((endpoint) => {
    socket.on(endpoint.path, (payload) => {
      const endpointsMap = endpointsMapper.getMap();
      const localUrl = endpointsMap[endpoint.path];

      if (!localUrl) {
        console.log(`[SKIP] ${endpoint.path} - no local URL configured`);
        return;
      }

      const url = buildUrl(localUrl, payload.query);
      const method = payload.method || endpoint.method || "GET";

      // Replicate original headers, removing hop-by-hop headers
      const forwardHeaders = { ...(payload.headers || {}) };
      delete forwardHeaders["host"];
      delete forwardHeaders["connection"];
      delete forwardHeaders["content-length"]; // let axios recalculate
      delete forwardHeaders["transfer-encoding"];

      // Decode raw body from base64 back to exact original bytes
      const body = payload.rawBody
        ? Buffer.from(payload.rawBody, "base64")
        : undefined;

      const logEntry = {
        timestamp: new Date().toISOString(),
        webhookPath: endpoint.path,
        localUrl,
        method,
        status: "pending",
      };

      axios({
        method,
        url,
        headers: forwardHeaders,
        data: body,
        // Prevent axios from re-serializing the body (send raw bytes as-is)
        transformRequest: [(data) => data],
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
        .then((res) => {
          logEntry.status = "success";
          logEntry.statusCode = res.status;
          console.log(`[OK] ${endpoint.method.toUpperCase()} ${endpoint.path} -> ${url} (${res.status})`);
        })
        .catch((err) => {
          logEntry.status = "error";
          logEntry.error = err.message;
          console.log(`[ERR] ${endpoint.method.toUpperCase()} ${endpoint.path} -> ${url}: ${err.message}`);
        })
        .finally(() => {
          forwardLog.unshift(logEntry);
          if (forwardLog.length > MAX_LOG_SIZE) forwardLog.pop();
        });
    });
  });
}

socket.on("connect", async () => {
  socketConnected = true;
  console.log(`Connected to server: ${SERVER_URL}`);
  try {
    const response = await axios.get(`${SERVER_URL}/endpoints`);
    registerEndpoints(response.data);
    console.log(`Registered ${response.data.length} endpoint listeners`);
  } catch (err) {
    console.error("Failed to fetch endpoints:", err.message);
  }
});

socket.on("disconnect", () => {
  socketConnected = false;
  console.log("Disconnected from server");
});

socket.on("connect_error", (err) => {
  socketConnected = false;
  console.error("Connection error:", err.message);
});

// Re-register on endpoints update from server
socket.on("endpoints:updated", (endpoints) => {
  console.log("Endpoints updated from server, re-registering listeners...");
  registerEndpoints(endpoints);
});

// --- Auth routes ---
app.get("/login", (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { secret } = req.body;
  if (secret === API_SECRET) {
    req.session.authenticated = true;
    return res.redirect("/");
  }
  res.render("login", { error: "Secret incorrecto" });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// --- UI ---
app.get("/", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${SERVER_URL}/endpoints`);
    const endpoints = response.data;
    const endpointsMap = endpointsMapper.getMap();

    endpoints.forEach((endpoint) => {
      endpoint.localUrl = endpointsMap[endpoint.path] || "";
    });

    res.render("index", {
      endpoints,
      serverUrl: SERVER_URL,
      connected: socketConnected,
      forwardLog: forwardLog.slice(0, 20),
    });
  } catch (err) {
    res.render("index", {
      endpoints: [],
      serverUrl: SERVER_URL,
      connected: socketConnected,
      forwardLog: forwardLog.slice(0, 20),
    });
  }
});

// --- API ---
app.get("/api/endpoints", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${SERVER_URL}/endpoints`);
    const endpoints = response.data;
    const endpointsMap = endpointsMapper.getMap();

    endpoints.forEach((endpoint) => {
      endpoint.localUrl = endpointsMap[endpoint.path] || "";
    });

    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/map-endpoint", requireAuth, (req, res) => {
  const { localUrl, path: webhookPath } = req.body;
  if (!localUrl || !webhookPath) {
    return res.status(400).json({ error: "localUrl and path are required" });
  }
  endpointsMapper.createOrUpdate(webhookPath, localUrl);
  res.json({ success: true });
});

app.get("/api/status", requireAuth, (req, res) => {
  res.json({
    connected: socketConnected,
    serverUrl: SERVER_URL,
    forwardLog: forwardLog.slice(0, 20),
  });
});

// --- Start ---
const PORT = process.env.CLIENT_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Client UI running on http://localhost:${PORT}`);
  console.log(`Server URL: ${SERVER_URL}`);
});
