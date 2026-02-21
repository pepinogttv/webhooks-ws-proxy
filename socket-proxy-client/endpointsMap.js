const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "endpointsMap.json");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
  }
}

function get() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function set(endpoints) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(endpoints, null, 2));
}

function getMap() {
  const maps = get();
  return maps.reduce((acc, map) => {
    acc[map.path] = map.localUrl;
    return acc;
  }, {});
}

function createOrUpdate(webhookPath, localUrl) {
  const maps = get();
  const existing = maps.find((map) => map.path === webhookPath);

  if (existing) {
    existing.localUrl = localUrl;
  } else {
    maps.push({ localUrl, path: webhookPath });
  }
  set(maps);
}

module.exports = { getMap, createOrUpdate };
