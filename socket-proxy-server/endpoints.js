const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "endpoints.json");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
  }
}

function getAll() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function save(endpoints) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(endpoints, null, 2));
}

function create(endpoint) {
  const endpoints = getAll();
  const exists = endpoints.find((e) => e.key === endpoint.key);
  if (exists) {
    throw new Error(`Endpoint with key "${endpoint.key}" already exists`);
  }
  endpoints.push({
    path: endpoint.path,
    method: endpoint.method.toLowerCase(),
    key: endpoint.key,
  });
  save(endpoints);
  return endpoint;
}

function update(key, data) {
  const endpoints = getAll();
  const index = endpoints.findIndex((e) => e.key === key);
  if (index === -1) {
    throw new Error(`Endpoint with key "${key}" not found`);
  }
  endpoints[index] = {
    ...endpoints[index],
    path: data.path || endpoints[index].path,
    method: (data.method || endpoints[index].method).toLowerCase(),
  };
  save(endpoints);
  return endpoints[index];
}

function remove(key) {
  const endpoints = getAll();
  const index = endpoints.findIndex((e) => e.key === key);
  if (index === -1) {
    throw new Error(`Endpoint with key "${key}" not found`);
  }
  const removed = endpoints.splice(index, 1)[0];
  save(endpoints);
  return removed;
}

module.exports = { getAll, create, update, remove };
