const fs = require("fs");

function get() {
  return JSON.parse(fs.readFileSync("./endpointsMap.json"));
}

function set(endpoints) {
  fs.writeFileSync("./endpointsMap.json", JSON.stringify(endpoints));
}

function getMap() {
  const maps = get();
  const _map = maps.reduce((acc, map) => {
    acc[map.path] = map.localPath;
    return acc;
  }, {});
  console.log(_map);
  return _map;
}

function createOrUpdate(path, localPath) {
  console.log({ localPath, path });
  const maps = get();
  const existingMap = maps.find((map) => map.localPath === localPath);

  if (existingMap) {
    existingMap.localPath = localPath;
  } else {
    maps.push({
      localPath,
      path,
    });
  }
  set(maps);
}

module.exports = {
  getMap,
  createOrUpdate,
};
