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

const db = new sqlite3.Database(dbPath);

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
}

/* =========================
   LOAD CSV FILES
========================= */

function loadCSV(file) {
  const data = fs.readFileSync(path.join(__dirname, file), "utf8");
  const lines = data.trim().split(/\r?\n/);
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
    time: ist.toTimeString().slice(0, 5),
    day: days[ist.getDay()],
    hour: ist.getHours()
  };
}

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
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Server Running");
});

/* =========================
   LOG ROUTE (UNCHANGED)
========================= */

app.get("/log", (req, res) => {

  const cardNo = req.query.card_no;

  if (!cardNo) return res.send("NO_CARD");

  const identity = identifyCard(cardNo);

  const { date, time, day } = getIndianTime();

  const slot = getActiveSlot(day, time, identity);

  if (!slot) return res.send("NO_SLOT");

  db.run(`INSERT INTO attendance (card_no) VALUES (?)`, [normalize(cardNo)]);

  const csvLine = [
    date,
    time,
    identity.type,
    identity.type === "STUDENT"
      ? identity.data.student_name
      : identity.data?.staff_name || "UNKNOWN",
    normalize(cardNo),
    slot.class,
    identity.type === "STUDENT"
      ? identity.data.batch
      : slot.batch,
    slot.subject
  ].join(",") + "\n";

  fs.appendFileSync(csvPath, csvLine);

  res.send("OK");
});

/* =========================
   DOWNLOAD
========================= */

app.get("/download", (req, res) => {
  res.download(csvPath);
});

/* =========================
   API (FIXED)
========================= */

app.get("/api/dashboard", (req, res) => {

  const data = fs.readFileSync(csvPath, "utf8");
  const lines = data.trim().split(/\r?\n/).slice(1);

  let records = lines.map(l => {
    const parts = l.split(",");
    if (parts.length < 8) return null;

    return {
      date: parts[0],
      name: parts[3],
      className: parts[5],
      batch: parts[6],
      subject: parts[7]
    };
  }).filter(x => x && x.name);

  let student = {}, subjectWise = {}, classWise = {};

  records.forEach(r => {
    student[r.name] = (student[r.name] || 0) + 1;
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
    classWise[r.className] = (classWise[r.className] || 0) + 1;
  });

  let totalLectures = [...new Set(records.map(r => r.date + r.subject))].length;

  let studentData = {};
  Object.keys(student).forEach(n => {
    let p = (student[n] / totalLectures) * 100;
    studentData[n] = {
      count: student[n],
      percent: p.toFixed(1),
      def: p < 75
    };
  });

  res.json({
    totalLectures,
    studentData,
    subjectWise,
    classWise
  });
});

/* =========================
   DASHBOARD UI
========================= */

app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white}
.sidebar{width:220px;background:#1e293b;padding:20px;float:left;height:100vh}
.main{margin-left:220px;padding:20px}
.card{background:#111827;padding:20px;margin:10px;border-radius:10px}
</style>
</head>

<body>

<div class="sidebar">
<button onclick="view='subject';load()">Subject</button>
<button onclick="view='class';load()">Class</button>
<button onclick="view='hod';load()">HOD</button>
<button onclick="exportData()">Export</button>
</div>

<div class="main">
<div class="card">
<h3>Total Lectures: <span id="lec"></span></h3>
</div>

<canvas id="chart"></canvas>

<div class="card">
<table id="table"></table>
</div>
</div>

<script>
let view="subject",chart;

async function load(){
 let d=await fetch("/api/dashboard").then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;

 let labels,values;

 if(view==="subject"){
  labels=Object.keys(d.subjectWise);
  values=Object.values(d.subjectWise);
 }
 else if(view==="class"){
  labels=Object.keys(d.studentData);
  values=Object.values(d.studentData).map(x=>x.count);
 }
 else{
  labels=Object.keys(d.classWise);
  values=Object.values(d.classWise);
 }

 if(chart) chart.destroy();
 chart=new Chart(chart,{type:"bar",data:{labels:labels,datasets:[{data:values}]}});

 let t=document.getElementById("table");
 t.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr><td>\${n}</td><td>\${v.percent}%</td></tr>\`;
 });
}

function exportData(){window.location="/download";}
load();
</script>

</body>
</html>
`);
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log("🚀 Server running");
});