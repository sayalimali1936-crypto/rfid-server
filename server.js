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

/* ===== IST + HH:MM FIX ===== */
function getIndianDayTime() {
  const nowUTC = new Date();
  const istTime = new Date(nowUTC.getTime() + (5.5 * 60 * 60 * 1000));

  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return {
    day: days[istTime.getDay()],
    time: istTime.toTimeString().slice(0, 5) // HH:MM
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
  console.log("ℹ️ Root endpoint hit – server is awake");
  res.send("RFID Attendance Server running (IST) ✅");
});

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  /* ===== SERVER SLEEP / WAKEUP VISIBILITY ===== */
  if (!cardNo || cardNo.toLowerCase() === "wakeup") {
    console.log("🟡 SERVER WAKEUP EVENT");
    console.log("ℹ️ No scan processed. Server is now ready.");
    console.log("👉 Please scan card again.");
    return res.send("SERVER_WAKING_UP");
  }

  console.log("────────────────────────────");
  console.log("📥 Scan request received");
  console.log("Card No:", cardNo);

  const identity = identifyCard(cardNo);
  console.log("🪪 Card Type:", identity.type);

  if (identity.type === "UNKNOWN") {
    console.log("❌ RESULT: Unknown card – not in database");
    return res.send("REJECTED_UNKNOWN_CARD");
  }

  const { day, time } = getIndianDayTime();
  console.log(`🕒 IST Time Used → ${day} ${time}`);

  const activeSlots = getActiveSlots(day, time);
  console.log("📚 Active timetable slots:", activeSlots.length);

  if (activeSlots.length === 0) {
    console.log("❌ RESULT: No active slot at this time");
    return res.send("REJECTED_NO_ACTIVE_SLOT");
  }

  /* STUDENT */
  if (identity.type === "STUDENT") {
    const valid = activeSlots.find(s =>
      normalize(s.class) === normalize(identity.data.class) &&
      (normalize(s.batch) === normalize(identity.data.batch) || normalize(s.batch) === "ALL")
    );

    if (!valid) {
      console.log("❌ RESULT: Student not eligible for this slot");
      return res.send("REJECTED_STUDENT_NOT_ELIGIBLE");
    }

    console.log("✅ RESULT: Student accepted");
    console.log("Name :", identity.data.student_name);
    console.log("Class:", identity.data.class);
    console.log("Batch:", identity.data.batch);
  }

  /* STAFF */
  if (identity.type === "STAFF") {
    const valid = activeSlots.find(s =>
      normalize(s.staff_id) === normalize(identity.data.staff_id)
    );

    if (!valid) {
      console.log("❌ RESULT: Staff not scheduled for this slot");
      return res.send("REJECTED_STAFF_NOT_SCHEDULED");
    }

    console.log("✅ RESULT: Staff accepted");
    console.log("Name :", identity.data.staff_name);
    console.log("Staff ID:", identity.data.staff_id);
  }

  /* STORE */
  db.run(`INSERT INTO attendance (card_no) VALUES (?)`, [normalize(cardNo)]);
  fs.appendFile(csvPath, `${normalize(cardNo)},${new Date().toISOString()}\n`, () => {});

  console.log("📌 ATTENDANCE LOGGED SUCCESSFULLY");
  console.log("────────────────────────────");

  res.send("SCAN_ACCEPTED");
});

/* DOWNLOAD */
app.get("/download", (req, res) => {
  console.log("⬇️ Attendance CSV downloaded");
  res.download(csvPath, "attendance.csv");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} (IST enabled)`);
});
