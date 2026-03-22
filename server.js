/* =========================
   IMPORTS
========================= */
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
)`);

if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(csvPath,
    "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* =========================
   LOAD CSV
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
  const student = students.find(s => normalize(s.card_no) === normalize(cardNo));
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(s => normalize(s.staff_card_no) === normalize(cardNo));
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

function getIndianTime() {
  const d = new Date(new Date().getTime() + 19800000);
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return {
    date: d.toISOString().slice(0,10),
    time: d.toTimeString().slice(0,5),
    day: days[d.getDay()]
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
      return normalize(slot.class) === normalize(identity.data.class);
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
app.get("/", (req,res)=>res.send("RFID Running"));

/* =========================
   LOG ROUTE (UNCHANGED)
========================= */
app.get("/log",(req,res)=>{
  const card=req.query.card_no;
  if(!card) return res.send("NO_CARD");

  const id=identifyCard(card);
  const {date,time,day}=getIndianTime();

  const slot=getActiveSlot(day,time,id);
  if(!slot) return res.send("NO_SLOT");

  db.run(`INSERT INTO attendance (card_no) VALUES (?)`,[normalize(card)]);

  const csv=[date,time,id.type,
    id.data?.student_name || id.data?.staff_name || "UNKNOWN",
    card,
    slot.class,
    id.data?.batch || slot.batch,
    slot.subject
  ].join(",")+"\n";

  fs.appendFileSync(csvPath,csv);

  res.send("OK");
});

/* =========================
   DOWNLOAD
========================= */
app.get("/download",(req,res)=>res.download(csvPath));

/* =========================
   API (FIXED)
========================= */
app.get("/api/dashboard",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],subject:p[7]};
 }).filter(x=>x && x.name);

 let student={},subjectWise={},classWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/totalLectures)*100;
  studentData[n]={count:student[n],percent:p.toFixed(1),def:p<75};
 });

 res.json({totalLectures,studentData,subjectWise,classWise});
});

/* =========================
   DASHBOARD UI (FIXED)
========================= */
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}
.sidebar{width:220px;background:#1e293b;padding:20px}
.sidebar button{width:100%;margin:6px;padding:12px;background:#6366f1;border:none;color:white;border-radius:8px}
.main{flex:1;padding:20px}

.cards{display:flex;gap:15px}
.card{flex:1;padding:20px;border-radius:12px;background:#111827;text-align:center}

.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px}

table{width:100%;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}

.def{color:red}
.ok{color:#22c55e}
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

<div class="cards">
<div class="card">Lectures<h2 id="lec"></h2></div>
<div class="card">Students<h2 id="stu"></h2></div>
<div class="card">Defaulters<h2 id="def"></h2></div>
</div>

<div class="grid">
<canvas id="bar"></canvas>
<canvas id="pie"></canvas>
</div>

<canvas id="line" style="margin-top:20px"></canvas>

<table style="margin-top:20px">
<tbody id="table"></tbody>
</table>

</div>

<script>
let view="subject";
let barChart,pieChart,lineChart;

async function load(){
 let d=await fetch("/api/dashboard").then(r=>r.json());

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

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

 if(barChart) barChart.destroy();
 barChart=new Chart(document.getElementById("bar"),{
  type:"bar",
  data:{labels:labels,datasets:[{data:values}]}
 });

 if(pieChart) pieChart.destroy();
 pieChart=new Chart(document.getElementById("pie"),{
  type:"doughnut",
  data:{labels:labels,datasets:[{data:values}]}
 });

 if(lineChart) lineChart.destroy();
 lineChart=new Chart(document.getElementById("line"),{
  type:"line",
  data:{labels:labels,datasets:[{data:values}]}
 });

 let t=document.getElementById("table");
 t.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr><td>\${n}</td><td>\${v.percent}%</td><td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td></tr>\`;
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
app.listen(PORT,()=>console.log("🚀 Server running"));