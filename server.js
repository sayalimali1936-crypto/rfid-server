const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   SQLITE DATABASE SETUP
========================= */

const dbPath = path.join(__dirname, "attendance.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to SQLite:", err.message);
  } else {
    console.log("✅ SQLite database connected");
  }
});

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

// Home
app.get("/", (req, res) => {
  res.send("RFID Server with SQLite is running ✅");
});

// Log RFID
app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  if (!cardNo) {
    return res.status(400).send("NO CARD NUMBER");
  }

  db.run(
    `INSERT INTO attendance (card_no) VALUES (?)`,
    [cardNo],
    (err) => {
      if (err) {
        console.error("❌ Insert failed:", err.message);
        return res.status(500).send("ERROR");
      }

      console.log("📌 Attendance logged:", cardNo);
      res.send("OK");
    }
  );
});

// 📥 DOWNLOAD ATTENDANCE AS CSV
app.get("/download", (req, res) => {
  db.all(
    `SELECT card_no, timestamp FROM attendance ORDER BY timestamp DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error("❌ Fetch failed:", err.message);
        return res.status(500).send("ERROR");
      }

      let csv = "Card Number,Timestamp\n";
      rows.forEach((row) => {
        csv += `${row.card_no},${row.timestamp}\n`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=attendance.csv"
      );

      res.send(csv);
    }
  );
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
