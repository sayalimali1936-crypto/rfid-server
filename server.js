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
   LOAD CSV FILES (STEP 1)
========================= */

function loadCSV(fileName) {
  const filePath = path.join(__dirname, fileName);
  const data = fs.readFileSync(filePath, "utf8");

  const lines = data.trim().split("\n");
  const headers = lines.shift().split(",");

  const records = lines.map(line => {
    const values = line.split(",");
    let obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim();
    });
    return obj;
  });

  return records;
}

// Load all CSVs
const students = loadCSV("Students.csv");
const staffMaster = loadCSV("Staff_Master.csv");
const staffRoles = loadCSV("Staff_Roles.csv");
const staffTeaching = loadCSV("Staff_Teaching.csv");
const timetable = loadCSV("Time_Table.csv");

// Log counts
console.log("📄 CSV FILES LOADED:");
console.log("Students:", students.length);
console.log("Staff Master:", staffMaster.length);
console.log("Staff Roles:", staffRoles.length);
console.log("Staff Teaching:", staffTeaching.length);
console.log("Time Table:", timetable.length);

/* =========================
   STEP 2: CARD IDENTIFICATION
========================= */

function identifyCard(cardNo) {
  const student = students.find(s => s.card_no === cardNo);
  if (student) {
    return { type: "STUDENT", data: student };
  }

  const staff = staffMaster.find(s => s.card_no === cardNo);
  if (staff) {
    return { type: "STAFF", data: staff };
  }

  return { type: "UNKNOWN", data: null };
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

  // 🔹 STEP 2: IDENTIFY CARD TYPE
  const identity = identifyCard(cardNo);
  console.log("🪪 Card Type:", identity.type);

  // (NO rejection yet — that comes later)

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

      res.send("OK");
    }
  );
});

// Download CSV
app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
