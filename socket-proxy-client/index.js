const socketIoClient = require("socket.io-client");
const socket = socketIoClient("http://localhost:3000");
const axios = require("axios");
const express = require("express");
const app = express();
const cors = require("cors");
const endpointsMapper = require("./endpointsMap");

app.use(express.json());
app.use(cors());

const LOCAL_URL = process.env.LOCAL_URL || "http://localhost:3000";

function buildUrl(path, query = {}) {
  const url = new URL(LOCAL_URL + path);
  Object.keys(query).forEach((key) => {
    url.searchParams.append(key, query[key]);
  });
  return url.toString();
}

function registerEndpoints(endpoints) {
  endpoints.forEach((endpoint) => {
    socket.on(endpoint.path, (partialReq) => {
      console.log(partialReq);
      const url = buildUrl(endpoint.path, partialReq.query);

      const data = partialReq.body
        ? {
            data: partialReq.body,
          }
        : {};

      axios({
        method: endpoint.method || "get",
        url: url.toString(),
        ...data,
      }).catch((err) => {
        console.log(err.message);
      });
    });
  });
}

socket.on("connect", async () => {
  const endpoints = await getEndpoints();
  registerEndpoints(endpoints);
});

async function getEndpoints() {
  const response = await axios({
    method: "get",
    url: "http://localhost:3000/endpoints",
  });
  return response.data;
}

app.get("/endpoints", async (req, res) => {
  const endpoints = await getEndpoints();
  const endpointsMap = endpointsMapper.getMap();

  endpoints.forEach((endpoint) => {
    const map = endpointsMap[endpoint.path];
    if (map) {
      endpoint.localPath = map;
    }
  });

  res.json(endpoints);
});

app.post("/map-endpoint", (req, res) => {
  const { localPath, path } = req.body;
  endpointsMapper.createOrUpdate(path, localPath);
  res.json({ success: true });
});

app.listen(3001, () => {
  console.log("Listening on port 3001");
});
