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
   LOGIN SYSTEM
========================= */
app.get("/login", (req, res) => {
res.send(`
<html>
<head>
<style>
body{font-family:sans-serif;background:#0f172a;color:white;text-align:center;padding-top:100px}
input,select{padding:10px;margin:10px}
button{padding:10px;background:#3b82f6;color:white;border:none}
</style>
</head>
<body>

<h2>Login</h2>
<select id="role">
<option value="teacher">Teacher</option>
<option value="hod">HOD</option>
</select><br>
<input id="pass" type="password"><br>
<button onclick="go()">Login</button>

<script>
function go(){
 if(document.getElementById("pass").value=="1234")
 location="/dashboard";
 else alert("Wrong password");
}
</script>

</body>
</html>
`);
});


/* =========================
   ADVANCED DASHBOARD API
========================= */
app.get("/api/dashboard", (req, res) => {

  const data = fs.readFileSync(csvPath, "utf8");
  const lines = data.trim().split("\\n").slice(1);

  let records = lines.map(l=>{
    const [date,time,role,name,card,className,batch,subject] = l.split(",");
    return {date,time,role,name,className,batch,subject};
  });

  // only students
  records = records.filter(r=>r.role==="STUDENT");

  const { classFilter, batchFilter, period } = req.query;

  if(classFilter) records = records.filter(r=>r.className===classFilter);
  if(batchFilter) records = records.filter(r=>r.batch===batchFilter);

  // time filter
  let now = new Date();
  if(period==="week"){
    let d=new Date(); d.setDate(now.getDate()-7);
    records = records.filter(r=> new Date(r.date)>=d);
  }
  if(period==="month"){
    let d=new Date(); d.setMonth(now.getMonth()-1);
    records = records.filter(r=> new Date(r.date)>=d);
  }

  let student={},subject={},classWise={};

  records.forEach(r=>{
    student[r.name]=(student[r.name]||0)+1;
    subject[r.subject]=(subject[r.subject]||0)+1;
    classWise[r.className]=(classWise[r.className]||0)+1;
  });

  let totalLectures = [...new Set(records.map(r=>r.date+r.subject))].length;

  let studentData={};
  Object.keys(student).forEach(n=>{
    let p=(student[n]/totalLectures)*100;
    studentData[n]={
      count:student[n],
      percent:p.toFixed(1),
      def:p<75
    };
  });

  res.json({
    totalLectures,
    studentData,
    subject,
    classWise
  });
});


/* =========================
   REJECTED PAGE
========================= */
app.get("/rejected",(req,res)=>{
res.send("<h1 style='text-align:center'>🚫 Rejected Scans</h1>");
});


/* =========================
   POWER BI STYLE DASHBOARD
========================= */
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;display:flex;font-family:Segoe UI;background:#020617;color:white}
.sidebar{width:240px;background:#1e293b;padding:20px}
.sidebar h2{text-align:center}
.sidebar button{width:100%;margin:5px;padding:10px;background:#3b82f6;border:none;color:white;border-radius:6px}

.main{flex:1;padding:20px}

.cards{display:flex;gap:15px}
.card{
 flex:1;
 background:rgba(255,255,255,0.05);
 backdrop-filter:blur(10px);
 padding:20px;
 border-radius:12px;
 text-align:center
}

.section{
 margin-top:20px;
 background:#0f172a;
 padding:20px;
 border-radius:12px
}

select{padding:8px;margin:5px}

table{width:100%;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #333}

.def{color:red}
.ok{color:#22c55e}
</style>
</head>

<body>

<div class="sidebar">
<h2>Dashboard</h2>

<button onclick="view='subject';load()">Subject</button>
<button onclick="view='class';load()">Class</button>
<button onclick="view='hod';load()">HOD</button>

<hr>

<select id="class">
<option value="">All Class</option>
<option>BE</option>
</select>

<select id="batch">
<option value="">All Batch</option>
<option>BE-1</option>
</select>

<select id="period">
<option value="">All Time</option>
<option value="week">Weekly</option>
<option value="month">Monthly</option>
</select>

<button onclick="load()">Apply</button>
<button onclick="exportData()">Export</button>

</div>

<div class="main">

<div class="cards">
<div class="card">Lectures<br><h2 id="lec"></h2></div>
<div class="card">Students<br><h2 id="stu"></h2></div>
</div>

<div class="section">
<canvas id="bar"></canvas>
</div>

<div class="section">
<canvas id="pie"></canvas>
</div>

<div class="section">
<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>
</div>

</div>

<script>
let view="subject",barChart,pieChart;

async function load(){
 let url="/api/dashboard?";
 url+="classFilter="+document.getElementById("class").value+"&";
 url+="batchFilter="+document.getElementById("batch").value+"&";
 url+="period="+document.getElementById("period").value;

 let d=await fetch(url).then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;
 document.getElementById("stu").innerText=Object.keys(d.studentData).length;

 let labels,values;

 if(view==="subject"){
  labels=Object.keys(d.subject);
  values=Object.values(d.subject);
 }
 else if(view==="class"){
  labels=Object.keys(d.studentData);
  values=Object.values(d.studentData).map(x=>x.count);
 }
 else{
  labels=Object.keys(d.classWise);
  values=Object.values(d.classWise);
 }

 if(barChart) barChart.destroy();
 barChart=new Chart(bar,{type:"bar",data:{labels:labels,datasets:[{data:values}]}});

 if(pieChart) pieChart.destroy();
 pieChart=new Chart(pie,{type:"pie",data:{labels:labels,datasets:[{data:values}]}});

 let t=document.getElementById("table");
 t.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr>
  <td>\${n}</td>
  <td>\${v.percent}%</td>
  <td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });
}

function exportData(){
 window.location="/download";
}

load();
setInterval(load,5000);
</script>

</body>
</html>
`);
});