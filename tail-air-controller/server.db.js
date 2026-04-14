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

  // Updated table creation with the new zoom and expComp columns
  db.run(
    "CREATE TABLE IF NOT EXISTS camera_config (cam TEXT PRIMARY KEY, aiMode INTEGER, trackingSpeed INTEGER, wbMode INTEGER, colorTemp INTEGER, zoom INTEGER, expComp INTEGER)",
  );

  // Safely attempt to add new columns to existing DBs (fails silently if they already exist)
  db.run("ALTER TABLE camera_config ADD COLUMN zoom INTEGER", (err) => {});
  db.run("ALTER TABLE camera_config ADD COLUMN expComp INTEGER", (err) => {});

  // Table to save auto-switch settings
  db.run(
    "CREATE TABLE IF NOT EXISTS auto_switch (id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER, mobile INTEGER, min INTEGER, max INTEGER)",
  );
  // Insert default row if it doesn't exist
  db.run(
    "INSERT OR IGNORE INTO auto_switch (id, enabled, mobile, min, max) VALUES (1, 0, 0, 5, 15)",
  );
});

module.exports = db;
