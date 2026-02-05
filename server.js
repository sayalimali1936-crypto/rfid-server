const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   DATABASE SETUP
========================= */

const dbPath = path.join(__dirname, "attendance.db");
const csvPath = path.join(__dirname, "attendance.csv");
const reportsDir = path.join(__dirname, "reports");

if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

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

db.run(`
  CREATE TABLE IF NOT EXISTS session_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no TEXT,
    session_key TEXT
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
    headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
    return obj;
  });
}

const students = loadCSV("Students.csv");
const staffMaster = loadCSV("Staff_Master.csv");
const staffTeaching = loadCSV("Staff_Teaching.csv");
const timetable = loadCSV("Time_Table.csv");

/* =========================
   HELPERS
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

// Handles 101 / T101 / CS101 etc.
function cleanStaffId(v) {
  return normalize(v).replace(/[^0-9]/g, "");
}

function identifyCard(cardNo) {
  const card = normalize(cardNo);

  const student = students.find(s => normalize(s.card_no) === card);
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(s => normalize(s.card_no) === card);
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

/* ===== IST TIME FIX ===== */
function getCurrentDayTime() {
  const now = new Date();
  now.setHours(now.getHours() + 5);
  now.setMinutes(now.getMinutes() + 30);

  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return {
    day: days[now.getDay()],
    time: now.toTimeString().slice(0, 8),
    date: now.toISOString().slice(0, 10)
  };
}

function getActiveSlots(day, time) {
  return timetable.filter(slot =>
    normalize(slot.day) === normalize(day) &&
    slot.start_time <= time &&
    slot.end_time >= time
  );
}

function generateSessionKey(slot) {
  return [
    slot.day,
    slot.start_time,
    slot.end_time,
    slot.class,
    slot.batch,
    slot.subject
  ].join("|");
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Attendance Server running ✅");
});

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;
  if (!cardNo) return res.send("OK");

  const identity = identifyCard(cardNo);

  if (identity.type === "UNKNOWN") {
    console.log("❌ UNKNOWN CARD:", cardNo);
    return res.send("OK");
  }

  const { day, time, date } = getCurrentDayTime();
  const activeSlots = getActiveSlots(day, time);
  let validSlot = null;

  /* ===== STUDENT ===== */
  if (identity.type === "STUDENT") {
    validSlot = activeSlots.find(s =>
      normalize(s.class) === normalize(identity.data.class) &&
      (normalize(s.batch) === normalize(identity.data.batch) || normalize(s.batch) === "ALL")
    );
    if (!validSlot) return res.send("OK");

    console.log("🎓 STUDENT ATTENDANCE");
    console.log("Name      :", identity.data.student_name);
    console.log("Class     :", identity.data.class);
    console.log("Batch     :", identity.data.batch);
    console.log("Subject   :", validSlot.subject);
    console.log("Card No   :", normalize(cardNo));
  }

  /* ===== STAFF ===== */
  if (identity.type === "STAFF") {
    const staffId = cleanStaffId(identity.data.staff_id);

    validSlot = activeSlots.find(
      s => cleanStaffId(s.staff_id) === staffId
    );
    if (!validSlot) return res.send("OK");

    const teaches = staffTeaching.find(t =>
      cleanStaffId(t.staff_id) === staffId &&
      normalize(t.class) === normalize(validSlot.class) &&
      (normalize(t.batch) === normalize(validSlot.batch) || normalize(t.batch) === "ALL") &&
      normalize(t.subject) === normalize(validSlot.subject)
    );
    if (!teaches) return res.send("OK");

    console.log("👨‍🏫 STAFF ATTENDANCE");
    console.log("Name      :", identity.data.staff_name);
    console.log("Staff ID  :", identity.data.staff_id);
    console.log("Class     :", validSlot.class);
    console.log("Batch     :", validSlot.batch);
    console.log("Subject   :", validSlot.subject);
    console.log("Card No   :", normalize(cardNo));
  }

  /* ===== DOUBLE SCAN BLOCK ===== */
  const sessionKey = generateSessionKey(validSlot);

  db.get(
    `SELECT 1 FROM session_attendance WHERE card_no=? AND session_key=?`,
    [normalize(cardNo), sessionKey],
    (err, row) => {
      if (row) return res.send("OK");

      db.run(
        `INSERT INTO session_attendance (card_no, session_key) VALUES (?, ?)`,
        [normalize(cardNo), sessionKey]
      );

      db.run(
        `INSERT INTO attendance (card_no) VALUES (?)`,
        [normalize(cardNo)]
      );

      fs.appendFileSync(
        csvPath,
        `${normalize(cardNo)},${new Date().toISOString()}\n`
      );

      console.log("✅ ATTENDANCE LOGGED\n");
      res.send("OK");
    }
  );
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
