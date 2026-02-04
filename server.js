const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   DATABASE SETUP (SQLITE)
========================= */

const dbPath = path.join(__dirname, "attendance.db");
const csvPath = path.join(__dirname, "attendance.csv");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ SQLite connection failed:", err.message);
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
    console.error("❌ Table creation failed:", err.message);
  } else {
    console.log("✅ Attendance table ready");
  }
});

// Create CSV file with header if it doesn't exist
if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(csvPath, "Card Number,Timestamp\n");
  console.log("✅ CSV file created with header");
}

/* =========================
   ROUTES
========================= */

// Home
app.get("/", (req, res) => {
  res.send("RFID Server (SQLite + Auto CSV) is running ✅");
});

// Log RFID
app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  if (!cardNo) {
    return res.status(400).send("NO CARD NUMBER");
  }

  // 1️⃣ Insert into SQLite
  db.run(
    `INSERT INTO attendance (card_no) VALUES (?)`,
    [cardNo],
    function (err) {
      if (err) {
        console.error("❌ SQLite insert failed:", err.message);
        return res.status(500).send("ERROR");
      }

      // 2️⃣ Append to CSV
      const timestamp = new Date().toISOString();
      const csvLine = `${cardNo},${timestamp}\n`;

      fs.appendFile(csvPath, csvLine, (csvErr) => {
        if (csvErr) {
          console.error("❌ CSV append failed:", csvErr.message);
        } else {
          console.log("📌 Attendance logged:", cardNo);
        }
      });

      res.send("OK"); // ESP expects this
    }
  );
});

// Optional: download CSV anytime
app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
