const API_SECRET = process.env.API_SECRET;

if (!API_SECRET) {
  console.error("ERROR: API_SECRET environment variable is required");
  process.exit(1);
}

// Middleware for Express routes (checks session or header)
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  const headerSecret = req.headers["x-api-secret"];
  if (headerSecret === API_SECRET) {
    return next();
  }
  if (req.headers.accept && req.headers.accept.includes("text/html")) {
    return res.redirect("/login");
  }
  return res.status(401).json({ error: "Unauthorized" });
}

// Middleware for Socket.IO connections
function socketAuth(socket, next) {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token === API_SECRET) {
    return next();
  }
  return next(new Error("Authentication failed"));
}

function validateSecret(secret) {
  return secret === API_SECRET;
}

module.exports = { requireAuth, socketAuth, validateSecret, API_SECRET };
