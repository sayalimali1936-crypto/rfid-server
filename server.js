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

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir);
}

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

console.log("📄 CSV Loaded:", {
  students: students.length,
  staff: staffMaster.length,
  teaching: staffTeaching.length,
  timetable: timetable.length
});

/* =========================
   HELPERS
========================= */

function identifyCard(cardNo) {
  const student = students.find(s => s.card_no === cardNo);
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(s => s.card_no === cardNo);
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

function getCurrentDayTime() {
  const now = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return {
    day: days[now.getDay()],
    time: now.toTimeString().slice(0, 8),
    date: now.toISOString().slice(0, 10)
  };
}

function getActiveSlots(day, time) {
  return timetable.filter(slot =>
    slot.day === day &&
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

function appendDailyReport(data) {
  const filePath = path.join(
    reportsDir,
    `attendance_${data.date}.csv`
  );

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      "Date,Time,Card No,Role,Class,Batch,Subject\n"
    );
  }

  fs.appendFileSync(
    filePath,
    `${data.date},${data.time},${data.card},${data.role},${data.class},${data.batch},${data.subject}\n`
  );
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Attendance Server with Daily Reports is running ✅");
});

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;
  if (!cardNo) return res.send("OK");

  const identity = identifyCard(cardNo);
  console.log("🪪 Card Type:", identity.type);

console.log("DEBUG CARD:", cardNo);
console.log("DEBUG STUDENT MATCH:", students.find(s => s.card_no === cardNo));
console.log("DEBUG STAFF MATCH:", staffMaster.find(s => s.card_no === cardNo));


  if (identity.type === "UNKNOWN") {
    console.log("❌ Rejected: Unknown card");
    return res.send("OK");
  }

  const { day, time, date } = getCurrentDayTime();
  const activeSlots = getActiveSlots(day, time);
  let validSlot = null;

  if (identity.type === "STUDENT") {
    validSlot = activeSlots.find(s =>
      s.class === identity.data.class &&
      (s.batch === identity.data.batch || s.batch === "ALL")
    );
    if (!validSlot) return res.send("OK");
  }

  if (identity.type === "STAFF") {
    validSlot = activeSlots.find(s => s.staff_id === identity.data.staff_id);
    if (!validSlot) return res.send("OK");

    const teaches = staffTeaching.find(t =>
      t.staff_id === identity.data.staff_id &&
      t.class === validSlot.class &&
      (t.batch === validSlot.batch || t.batch === "ALL") &&
      t.subject === validSlot.subject
    );
    if (!teaches) return res.send("OK");
  }

  const sessionKey = generateSessionKey(validSlot);

  db.get(
    `SELECT 1 FROM session_attendance WHERE card_no=? AND session_key=?`,
    [cardNo, sessionKey],
    (err, row) => {
      if (row) {
        console.log("❌ Double scan blocked");
        return res.send("OK");
      }

      db.run(
        `INSERT INTO session_attendance (card_no, session_key) VALUES (?, ?)`,
        [cardNo, sessionKey]
      );

      db.run(`INSERT INTO attendance (card_no) VALUES (?)`, [cardNo]);

      fs.appendFile(csvPath, `${cardNo},${new Date().toISOString()}\n`, () => {});

      appendDailyReport({
        date,
        time,
        card: cardNo,
        role: identity.type,
        class: validSlot.class,
        batch: validSlot.batch,
        subject: validSlot.subject
      });

      console.log("📌 Attendance logged:", cardNo);
      res.send("OK");
    }
  );
});

app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

app.get("/report/today", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const filePath = path.join(reportsDir, `attendance_${today}.csv`);
  if (!fs.existsSync(filePath)) return res.send("No report yet");
  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
