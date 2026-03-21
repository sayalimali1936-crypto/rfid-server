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
  if (err) console.error("❌ DB ERROR:", err.message);
  else console.log("✅ Database connected");
});

db.run(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(
    csvPath,
    "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n"
  );
  console.log("📄 attendance.csv created");
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

console.log("📚 CSV Loaded:", {
  students: students.length,
  staff: staffMaster.length,
  timetable: timetable.length
});

/* =========================
   HELPERS
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

/* 🔑 TIME FIX — CORE FIX */
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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

function getIndianTime() {
  const utc = new Date();
  const ist = new Date(utc.getTime() + (5.5 * 60 * 60 * 1000));
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return {
    date: ist.toISOString().slice(0, 10),
    time: ist.toTimeString().slice(0, 5), // HH:MM
    day: days[ist.getDay()],
    hour: ist.getHours()
  };
}

/* ✅ FIXED ACTIVE SLOT LOGIC */
function getActiveSlot(day, time, identity) {
  const nowMin = timeToMinutes(time);

  return timetable.find(slot => {
    if (normalize(slot.day) !== normalize(day)) return false;

    const startMin = timeToMinutes(slot.start_time.slice(0,5));
    const endMin = timeToMinutes(slot.end_time.slice(0,5));

    if (nowMin < startMin || nowMin > endMin) return false;

    if (identity.type === "STUDENT") {
      return (
        normalize(slot.class) === normalize(identity.data.class) &&
        (
          normalize(slot.batch) === normalize(identity.data.batch) ||
          normalize(slot.batch) === "ALL"
        )
      );
    }

    if (identity.type === "STAFF") {
      return normalize(slot.staff_id) === normalize(identity.data.staff_id);
    }

    return false;
  });
}

/* =========================
   DAILY REPORT (4 PM IST)
========================= */

function generateDailyReportIfNeeded() {
  const { date, hour } = getIndianTime();
  if (hour < 16) return;

  const reportFile = `attendance_${date}.csv`;
  const reportPath = path.join(__dirname, reportFile);

  if (!fs.existsSync(reportPath)) {
    fs.copyFileSync(csvPath, reportPath);
    console.log(`📁 DAILY REPORT GENERATED: ${reportFile}`);
  }
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Attendance Server Running");
});

app.get("/log", (req, res) => {
  generateDailyReportIfNeeded();

  const cardNo = req.query.card_no;
  console.log("\n🔔 SCAN REQUEST RECEIVED");
  console.log("🆔 Card No:", cardNo);

  if (!cardNo) {
    console.log("❌ REJECTED: No card number");
    return res.send("NO_CARD");
  }

  const identity = identifyCard(cardNo);

  if (identity.type === "UNKNOWN") {
    console.log("❌ REJECTED: Unknown card");
    return res.send("UNKNOWN_CARD");
  }

  console.log("👤 Type:", identity.type);
  console.log("📛 Name:",
    identity.type === "STUDENT"
      ? identity.data.student_name
      : identity.data.staff_name
  );

  const { date, time, day } = getIndianTime();
  console.log("🕒 Time:", day, time);

  const slot = getActiveSlot(day, time, identity);

  if (!slot) {
    console.log("❌ REJECTED: No active timetable slot");
    return res.send("NO_SLOT");
  }

  console.log("📘 Subject:", slot.subject);
  console.log("🏫 Class:", slot.class);
  console.log("👥 Batch:",
    identity.type === "STUDENT"
      ? identity.data.batch
      : slot.batch
  );

  /* PROXY PREVENTION (10 min) */
  db.get(
    `SELECT timestamp FROM attendance WHERE card_no=? ORDER BY timestamp DESC LIMIT 1`,
    [normalize(cardNo)],
    (err, row) => {
      if (row) {
        const diff = (new Date() - new Date(row.timestamp)) / 1000;
        if (diff < 600) {
          console.log("🚫 REJECTED: Duplicate scan");
          return res.send("DUPLICATE");
        }
      }

      db.run(`INSERT INTO attendance (card_no) VALUES (?)`, [normalize(cardNo)]);

      const csvLine = [
        date,
        time,
        identity.type,
        identity.type === "STUDENT"
          ? identity.data.student_name
          : identity.data.staff_name,
        normalize(cardNo),
        slot.class,
        identity.type === "STUDENT"
          ? identity.data.batch
          : slot.batch,
        slot.subject
      ].join(",") + "\n";

      fs.appendFile(csvPath, csvLine, () => {});

      console.log("✅ ATTENDANCE LOGGED SUCCESSFULLY");
      res.send("OK");
    }
  );
});

app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

app.get("/download/today", (req, res) => {
  const { date } = getIndianTime();
  const file = `attendance_${date}.csv`;
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    return res.send("Daily report not generated yet");
  }

  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
/* =========================
   DASHBOARD API
========================= */

app.get("/api/dashboard", (req, res) => {
  const data = fs.readFileSync(csvPath, "utf8");
  const lines = data.trim().split("\n").slice(1);

  let records = lines.map(line => {
    const [date,time,role,name,card,className,batch,subject] = line.split(",");
    return { date,time,role,name,card,className,batch,subject };
  });

  // ✅ ONLY STUDENTS
  records = records.filter(r => r.role === "STUDENT");

  const today = new Date().toISOString().slice(0,10);

  const todayRecords = records.filter(r => r.date === today);

  // SUBJECT
  let subjectWise = {};
  let lectureCount = {};

  records.forEach(r => {
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
    lectureCount[r.subject] = (lectureCount[r.subject] || 0) + 1;
  });

  // STUDENT
  let studentWise = {};
  records.forEach(r => {
    studentWise[r.name] = (studentWise[r.name] || 0) + 1;
  });

  // CLASS
  let classWise = {};
  records.forEach(r => {
    classWise[r.className] = (classWise[r.className] || 0) + 1;
  });

  // DEFAULTERS (<3 logic demo)
  let defaulters = Object.entries(studentWise)
    .filter(([n,c]) => c < 3)
    .map(([n]) => n);

  res.json({
    total: records.length,
    today: todayRecords.length,
    subjectWise,
    studentWise,
    classWise,
    defaulters,
    records
  });
});
/* =========================
   WEB DASHBOARD
========================= */

app.get("/dashboard", (req, res) => {
res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Smart Attendance Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body { font-family: Arial; background:#eef2f7; margin:0; }

.nav {
  background:#1e293b;
  padding:10px;
  text-align:center;
}
.nav button {
  margin:5px;
  padding:10px;
  color:white;
  background:#3b82f6;
  border:none;
  border-radius:5px;
}

.container { padding:20px; }

.cards {
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}
.card {
  flex:1;
  background:white;
  padding:15px;
  border-radius:10px;
  text-align:center;
}

.section {
  margin-top:20px;
  background:white;
  padding:15px;
  border-radius:10px;
}

table { width:100%; border-collapse:collapse; }
th,td { padding:8px; border-bottom:1px solid #ddd; }

</style>
</head>

<body>

<div class="nav">
  <button onclick="view='subject';load()">Subject Teacher</button>
  <button onclick="view='class';load()">Class Teacher</button>
  <button onclick="view='hod';load()">HOD</button>
</div>

<div class="container">

<div class="cards">
  <div class="card">Total: <span id="total"></span></div>
  <div class="card">Today: <span id="today"></span></div>
  <div class="card">Defaulters: <span id="def"></span></div>
</div>

<div class="section">
  <canvas id="chart"></canvas>
</div>

<div class="section">
  <h3>Student Report</h3>
  <table>
    <thead>
      <tr><th>Name</th><th>Attendance</th></tr>
    </thead>
    <tbody id="table"></tbody>
  </table>
</div>

</div>

<script>
let view="subject";
let chart;

async function load(){
  const res = await fetch("/api/dashboard");
  const data = await res.json();

  document.getElementById("total").innerText = data.total;
  document.getElementById("today").innerText = data.today;
  document.getElementById("def").innerText = data.defaulters.length;

  // TABLE
  const tbody = document.getElementById("table");
  tbody.innerHTML="";
  Object.entries(data.studentWise).forEach(([n,c])=>{
    tbody.innerHTML += "<tr><td>"+n+"</td><td>"+c+"</td></tr>";
  });

  let labels, values;

  if(view==="subject"){
    labels = Object.keys(data.subjectWise);
    values = Object.values(data.subjectWise);
  }
  else if(view==="class"){
    labels = Object.keys(data.studentWise);
    values = Object.values(data.studentWise);
  }
  else{
    labels = Object.keys(data.classWise);
    values = Object.values(data.classWise);
  }

  if(chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type:"bar",
    data:{
      labels:labels,
      datasets:[{
        label:"Attendance",
        data:values,
        backgroundColor:"#3b82f6"
      }]
    }
  });
}

load();
setInterval(load,5000);
</script>

</body>
</html>
`);
});