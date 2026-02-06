const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE SETUP
========================= */

const dbPath = path.join(__dirname, "attendance.db");
const csvPath = path.join(__dirname, "attendance.csv");

const db = new sqlite3.Database(dbPath, err => {
  if (err) console.error("❌ SQLite error:", err.message);
  else console.log("✅ SQLite connected");
});

db.run(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(csvPath, "Card Number,Timestamp\n");
}

/* =========================
   LOAD CSV FILES
========================= */

function loadCSV(file) {
  const data = fs.readFileSync(path.join(__dirname, file), "utf8");
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
const timetable = loadCSV("Time_Table.csv");

console.log("📄 CSV Loaded:");
console.log("Students:", students.length);
console.log("Staff:", staffMaster.length);
console.log("Timetable:", timetable.length);

/* =========================
   HELPERS
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

function identifyCard(cardNo) {
  const student = students.find(
    s => normalize(s.card_no) === normalize(cardNo)
  );
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(
    s => normalize(s.staff_card_no) === normalize(cardNo)
  );
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

function getCurrentDayTime() {
  const now = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return {
    day: days[now.getDay()],
    time: now.toTimeString().slice(0, 8)
  };
}

function getActiveSlots(day, time) {
  return timetable.filter(slot =>
    normalize(slot.day) === normalize(day) &&
    slot.start_time <= time &&
    slot.end_time >= time
  );
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Attendance Server running ✅");
});

/* =========================
   MAIN RFID LOG ROUTE
========================= */

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  /* 🔴 RENDER WAKEUP HANDLER */
  if (!cardNo || cardNo.toLowerCase() === "wakeup") {
    console.log("🟡 SERVER WAKEUP CALL");
    return res.send("SERVER_WAKING_UP");
  }

  console.log("📥 Scan Received:", cardNo);

  const identity = identifyCard(cardNo);
  console.log("🪪 Card Type:", identity.type);

  if (identity.type === "UNKNOWN") {
    console.log("❌ UNKNOWN CARD:", cardNo);
    return res.send("REJECTED_UNKNOWN_CARD");
  }

  const { day, time } = getCurrentDayTime();
  const activeSlots = getActiveSlots(day, time);

  console.log(`📅 ${day} ⏰ ${time}`);
  console.log("📚 Active Slots:", activeSlots.length);

  if (activeSlots.length === 0) {
    console.log("❌ No active timetable slot");
    return res.send("REJECTED_NO_ACTIVE_SLOT");
  }

  /* STUDENT */
  if (identity.type === "STUDENT") {
    const valid = activeSlots.find(s =>
      normalize(s.class) === normalize(identity.data.class) &&
      (normalize(s.batch) === normalize(identity.data.batch) || normalize(s.batch) === "ALL")
    );

    if (!valid) {
      console.log("❌ Student not eligible for this session");
      return res.send("REJECTED_STUDENT_NOT_ELIGIBLE");
    }

    console.log(`✅ STUDENT ACCEPTED: ${identity.data.student_name}`);
  }

  /* STAFF */
  if (identity.type === "STAFF") {
    const valid = activeSlots.find(s =>
      normalize(s.staff_id) === normalize(identity.data.staff_id)
    );

    if (!valid) {
      console.log("❌ Staff not scheduled now");
      return res.send("REJECTED_STAFF_NOT_SCHEDULED");
    }

    console.log(`✅ STAFF ACCEPTED: ${identity.data.staff_name}`);
  }

  /* STORE ATTENDANCE */
  db.run(
    `INSERT INTO attendance (card_no) VALUES (?)`,
    [normalize(cardNo)]
  );

  fs.appendFile(
    csvPath,
    `${normalize(cardNo)},${new Date().toISOString()}\n`,
    () => {}
  );

  console.log("📌 ATTENDANCE LOGGED:", cardNo);
  return res.send("SCAN_ACCEPTED");
});

/* =========================
   DOWNLOAD CSV
========================= */

app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
