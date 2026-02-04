const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   SQLITE DATABASE SETUP
========================= */

// Database file (will be created automatically)
const dbPath = path.join(__dirname, "attendance.db");

// Connect to SQLite
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to SQLite:", err.message);
  } else {
    console.log("✅ SQLite database connected");
  }
});

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error("❌ Failed to create table:", err.message);
  } else {
    console.log("✅ Attendance table ready");
  }
});

/* =========================
   ROUTES
========================= */

// Root route
app.get("/", (req, res) => {
  res.send("RFID Server with SQLite is running ✅");
});

// RFID log route
app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  if (!cardNo) {
    return res.status(400).send("NO CARD NUMBER");
  }

  const query = `
    INSERT INTO attendance (card_no)
    VALUES (?)
  `;

  db.run(query, [cardNo], function (err) {
    if (err) {
      console.error("❌ Failed to insert attendance:", err.message);
      return res.status(500).send("ERROR");
    }

    console.log("📌 Attendance logged:", cardNo);
    res.send("OK"); // ESP expects this
  });
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
