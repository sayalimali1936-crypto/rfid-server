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

console.log("📄 CSV LOADED:", {
  students: students.length,
  staff: staffMaster.length,
  teaching: staffTeaching.length,
  timetable: timetable.length
});

/* =========================
   HELPERS
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

function cleanStaffId(v) {
  return normalize(v).replace(/[^0-9]/g, "");
}

function identifyCard(cardNo) {
  const card = normalize(cardNo);

  const student = students.find(s => normalize(s.card_no) === card);
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(
    s => normalize(s.staff_card_no) === card
  );
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

function getCurrentDayTime() {
  const now = new Date();
  now.setHours(now.getHours() + 5);
  now.setMinutes(now.getMinutes() + 30);

  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return {
    day: days[now.getDay()],
    time: now.toTimeString().slice(0, 8)
  };
}

function getActiveSlots(day, time) {
  return timetable.filter(s =>
    normalize(s.day) === normalize(day) &&
    s.start_time <= time &&
    s.end_time >= time
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
  res.send("RFID Attendance Server running");
});

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;
  if (!cardNo) {
    console.log("❌ ERROR: No card number received");
    return res.send("OK");
  }

  console.log("\n==============================");
  console.log("📡 CARD SCANNED:", cardNo);

  const identity = identifyCard(cardNo);
  console.log("🪪 CARD TYPE:", identity.type);

  if (identity.type === "UNKNOWN") {
    console.log("❌ REJECTED: Card not found in database");
    return res.send("OK");
  }

  const { day, time } = getCurrentDayTime();
  const activeSlots = getActiveSlots(day, time);

  console.log("📅 DAY:", day, "| ⏰ TIME:", time);
  console.log("📚 ACTIVE SLOTS:", activeSlots.length);

  let validSlot = null;

  /* ===== STUDENT ===== */
  if (identity.type === "STUDENT") {
    validSlot = activeSlots.find(s =>
      normalize(s.class) === normalize(identity.data.class) &&
      (normalize(s.batch) === normalize(identity.data.batch) || normalize(s.batch) === "ALL")
    );

    if (!validSlot) {
      console.log("❌ STUDENT REJECTED: No valid lecture/practical");
      return res.send("OK");
    }

    console.log("🎓 STUDENT ACCEPTED");
    console.log("Name :", identity.data.student_name);
    console.log("Class:", identity.data.class);
    console.log("Batch:", identity.data.batch);
    console.log("Subject:", validSlot.subject);
  }

  /* ===== STAFF ===== */
  if (identity.type === "STAFF") {
    const staffId = cleanStaffId(identity.data.staff_id);

    validSlot = activeSlots.find(
      s => cleanStaffId(s.staff_id) === staffId
    );

    if (!validSlot) {
      console.log("❌ STAFF REJECTED: No timetable slot allotted");
      return res.send("OK");
    }

    const teaches = staffTeaching.find(t =>
      cleanStaffId(t.staff_id) === staffId &&
      normalize(t.class) === normalize(validSlot.class) &&
      (normalize(t.batch) === normalize(validSlot.batch) || normalize(t.batch) === "ALL") &&
      normalize(t.subject) === normalize(validSlot.subject)
    );

    if (!teaches) {
      console.log("❌ STAFF REJECTED: Not assigned to teach this subject");
      return res.send("OK");
    }

    console.log("👨‍🏫 STAFF ACCEPTED");
    console.log("Name :", identity.data.staff_name);
    console.log("Staff ID:", identity.data.staff_id);
    console.log("Class:", validSlot.class);
    console.log("Batch:", validSlot.batch);
    console.log("Subject:", validSlot.subject);
  }

  /* ===== DOUBLE SCAN ===== */
  const sessionKey = generateSessionKey(validSlot);

  db.get(
    `SELECT 1 FROM session_attendance WHERE card_no=? AND session_key=?`,
    [normalize(cardNo), sessionKey],
    (err, row) => {
      if (row) {
        console.log("⛔ REJECTED: Duplicate scan in same session");
        return res.send("OK");
      }

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

      console.log("✅ ATTENDANCE LOGGED SUCCESSFULLY");
      res.send("OK");
    }
  );
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
