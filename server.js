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

  return lines.map(line => {
    const values = line.split(",");
    let obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim();
    });
    return obj;
  });
}

const students = loadCSV("Students.csv");
const staffMaster = loadCSV("Staff_Master.csv");
const staffRoles = loadCSV("Staff_Roles.csv");
const staffTeaching = loadCSV("Staff_Teaching.csv");
const timetable = loadCSV("Time_Table.csv");

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
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(s => s.card_no === cardNo);
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

/* =========================
   STEP 3: CURRENT SLOT DETECTION
========================= */

function getCurrentDayAndTime() {
  const now = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return {
    day: days[now.getDay()],
    time: now.toTimeString().slice(0, 8) // HH:MM:SS
  };
}

function findActiveTimetableSlots(day, time) {
  return timetable.filter(slot => {
    // ✅ FIXED: correct CSV column names (lowercase)
    return (
      slot.day === day &&
      slot.start_time <= time &&
      slot.end_time >= time
    );
  });
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Server (SQLite + Auto CSV) is running ✅");
});

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;
  if (!cardNo) return res.status(400).send("NO CARD NUMBER");

  // STEP 2
  const identity = identifyCard(cardNo);
  console.log("🪪 Card Type:", identity.type);

  // STEP 3
  const { day, time } = getCurrentDayAndTime();
  const activeSlots = findActiveTimetableSlots(day, time);

  console.log("📅 Today:", day, "⏰ Time:", time);
  console.log("📚 Active Slots Found:", activeSlots.length);

  // STEP 4 — STUDENT VALIDATION
  if (identity.type === "STUDENT") {
    if (activeSlots.length === 0) {
      console.log("❌ Rejected: No active lecture/practical");
      return res.send("OK");
    }

    const studentClass = identity.data.class;
    const studentBatch = identity.data.batch;

    const validSlot = activeSlots.find(slot => {
      const classMatch = slot.class === studentClass;
      const batchMatch = slot.batch === studentBatch || slot.batch === "ALL";
      return classMatch && batchMatch;
    });

    if (!validSlot) {
      console.log("❌ Rejected: Student not in this class/batch");
      return res.send("OK");
    }

    console.log("✅ Student validated for session:", validSlot.subject);
  }

  // STORE ATTENDANCE
  db.run(
    `INSERT INTO attendance (card_no) VALUES (?)`,
    [cardNo],
    function (err) {
      if (err) {
        console.error("❌ SQLite insert failed:", err.message);
        return res.status(500).send("ERROR");
      }

      const timestamp = new Date().toISOString();
      fs.appendFile(csvPath, `${cardNo},${timestamp}\n`, () => {
        console.log("📌 Attendance logged:", cardNo);
      });

      res.send("OK");
    }
  );
});

app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
