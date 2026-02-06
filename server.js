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

/* CSV HEADER (ALREADY AGREED FORMAT) */
if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(
    csvPath,
    "Date,Time,Role,Name,Card_No,Class,Batch,Session_Type,Subject\n"
  );
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
const timetable = loadCSV("Time_Table.csv");

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

/* IST TIME */
function getIndianDayTime() {
  const nowUTC = new Date();
  const istTime = new Date(nowUTC.getTime() + (5.5 * 60 * 60 * 1000));
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return {
    day: days[istTime.getDay()],
    time: istTime.toTimeString().slice(0, 5),
    date: istTime.toISOString().slice(0, 10)
  };
}

/* SLOT MATCH (UNCHANGED) */
function getActiveSlots(day, time) {
  return timetable.filter(slot => {
    const start = slot.start_time.slice(0, 5);
    const end = slot.end_time.slice(0, 5);

    return (
      normalize(slot.day) === normalize(day) &&
      start <= time &&
      end >= time
    );
  });
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Attendance Server running (IST) ✅");
});

app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  if (!cardNo || cardNo.toLowerCase() === "wakeup") {
    return res.send("SERVER_WAKING_UP");
  }

  const identity = identifyCard(cardNo);
  if (identity.type === "UNKNOWN") {
    return res.send("REJECTED_UNKNOWN_CARD");
  }

  const { day, time, date } = getIndianDayTime();
  const activeSlots = getActiveSlots(day, time);
  if (activeSlots.length === 0) {
    return res.send("REJECTED_NO_ACTIVE_SLOT");
  }

  let slotUsed = null;

  if (identity.type === "STUDENT") {
    slotUsed = activeSlots.find(s =>
      normalize(s.class) === normalize(identity.data.class) &&
      (normalize(s.batch) === normalize(identity.data.batch) || normalize(s.batch) === "ALL")
    );
    if (!slotUsed) return res.send("REJECTED_STUDENT_NOT_ELIGIBLE");
  }

  if (identity.type === "STAFF") {
    slotUsed = activeSlots.find(s =>
      normalize(s.staff_id) === normalize(identity.data.staff_id)
    );
    if (!slotUsed) return res.send("REJECTED_STAFF_NOT_SCHEDULED");
  }

  /* ===== ONLY ADDITION: PROXY PREVENTION ===== */
  db.get(
    `
    SELECT timestamp FROM attendance
    WHERE card_no = ?
    ORDER BY timestamp DESC
    LIMIT 1
    `,
    [normalize(cardNo)],
    (err, row) => {
      if (row) {
        const lastScan = new Date(row.timestamp);
        const now = new Date();
        const diffSeconds = (now - lastScan) / 1000;

        if (diffSeconds < 600) {
          return res.send("REJECTED_DUPLICATE_SCAN");
        }
      }

      /* STORE (UNCHANGED FORMAT) */
      const csvLine = [
        date,
        time,
        identity.type,
        identity.type === "STUDENT"
          ? identity.data.student_name
          : identity.data.staff_name,
        normalize(cardNo),
        slotUsed.class,
        slotUsed.batch,
        slotUsed.session_type,
        slotUsed.subject
      ].join(",") + "\n";

      db.run(`INSERT INTO attendance (card_no) VALUES (?)`, [normalize(cardNo)]);
      fs.appendFile(csvPath, csvLine, () => {});

      res.send("SCAN_ACCEPTED");
    }
  );
});

app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
