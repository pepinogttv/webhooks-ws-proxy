const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const app = express();
const _ = require("lodash");

const server = http.createServer(app);
const io = socketIo(server);
const endpoints = require("./simoncrack.json");

io.on("connection", (socket) => {
  console.log("connection");
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado");
  });
});

const router = express.Router();

endpoints.forEach((endpoint) => {
  router[endpoint.method](endpoint.path, (req, res) => {
    console.log("endpoint", endpoint.path, endpoint.method);
    io.emit(endpoint.path, {
      partialRequest: _.pick(req, ["headers", "body", "params", "query"]),
    });
  });
});

app.use(express.json());
app.use("/webhooks", router);

app.use("/endpoints", (req, res) => {
  res.json(endpoints);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
