const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "presets.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS presets (cam TEXT, presetId INTEGER, pan REAL, tilt REAL, zoom REAL, PRIMARY KEY(cam, presetId))",
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS auth_tokens (id INTEGER PRIMARY KEY CHECK (id = 1), tokens TEXT)",
  );
});

module.exports = db;
