const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* ============================================================
   🔒 BACKEND SECTION (DO NOT MODIFY THIS PART)
============================================================ */

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
 fs.writeFileSync(csvPath,"Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= LOAD CSV ================= */
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

/* ================= HELPERS ================= */
function normalize(v){ return v?.toString().trim().toUpperCase(); }

function timeToMinutes(t){
 const [h,m]=t.split(":").map(Number);
 return h*60+m;
}

function identifyCard(cardNo){
 const student = students.find(s=>normalize(s.card_no)===normalize(cardNo));
 if(student) return {type:"STUDENT",data:student};

 const staff = staffMaster.find(s=>normalize(s.staff_card_no)===normalize(cardNo));
 if(staff) return {type:"STAFF",data:staff};

 return {type:"UNKNOWN",data:null};
}

function getIndianTime(){
 const utc=new Date();
 const ist=new Date(utc.getTime()+19800000);
 const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 return {
  date:ist.toISOString().slice(0,10),
  time:ist.toTimeString().slice(0,5),
  day:days[ist.getDay()]
 };
}

function getActiveSlot(day,time,identity){
 const now=timeToMinutes(time);

 return timetable.find(slot=>{
  if(normalize(slot.day)!==normalize(day)) return false;

  const start=timeToMinutes(slot.start_time.slice(0,5));
  const end=timeToMinutes(slot.end_time.slice(0,5));

  if(now<start || now>end) return false;

  if(identity.type==="STUDENT"){
   return normalize(slot.class)===normalize(identity.data.class);
  }

  if(identity.type==="STAFF"){
   return normalize(slot.staff_id)===normalize(identity.data.staff_id);
  }

  return false;
 });
}

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const id=identifyCard(card);
 if(id.type==="UNKNOWN") return res.send("UNKNOWN");

 const {date,time,day}=getIndianTime();
 const slot=getActiveSlot(day,time,id);
 if(!slot) return res.send("NO_SLOT");

 db.run(`INSERT INTO attendance (card_no) VALUES (?)`,[normalize(card)]);

 const csv=[date,time,id.type,
  id.data?.student_name || id.data?.staff_name,
  card,
  slot.class,
  id.data?.batch || slot.batch,
  slot.subject
 ].join(",")+"\n";

 fs.appendFileSync(csvPath,csv);
 res.send("OK");
});

/* ================= API ================= */
app.get("/api/dashboard",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],subject:p[7]};
 }).filter(x=>x);

 let subjectWise={},studentWise={};

 records.forEach(r=>{
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  studentWise[r.name]=(studentWise[r.name]||0)+1;
 });

 res.json({total:records.length,subjectWise,studentWise,records});
});

/* ============================================================
   🎨 UI SECTION (ONLY THIS PART GIVE TO ANTIGRAVITY)
============================================================ */

app.get("/dashboard",(req,res)=>{
res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Enterprise RFID Dashboard</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<style>
:root {
  --bg-main: #0b0f19;
  --sidebar-bg: rgba(15, 23, 42, 0.6);
  --card-bg: rgba(30, 41, 59, 0.7);
  --glass-border: rgba(255, 255, 255, 0.08);
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --accent-1: #8b5cf6; 
  --accent-2: #06b6d4; 
  --danger: #f43f5e;
  --success: #10b981;
}

* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }

body { 
  background: radial-gradient(circle at top left, #1a1c2e, #0b0f19); 
  color: var(--text-main); 
  height: 100vh; 
  display: flex; 
}

/* Sidebar */
.sidebar { 
  width: 260px; 
  background: var(--sidebar-bg); 
  backdrop-filter: blur(16px); 
  border-right: 1px solid var(--glass-border); 
  padding: 1.5rem; 
}

.nav-item { cursor:pointer; margin:10px 0; }

.main-content { flex:1; padding:20px; }

.card { 
  background: var(--card-bg); 
  padding:15px; 
  margin:10px 0; 
  border-radius:10px; 
}

</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>
<div class="nav-item" onclick="switchView('dashboard')">Dashboard</div>
<div class="nav-item" onclick="switchView('faculty')">Faculty</div>
<div class="nav-item" onclick="switchView('hod')">HOD</div>
</div>

<div class="main-content">

<div id="dashboard">
<h2>Overview</h2>
<div class="card">Total Attendance: <span id="total"></span></div>
<canvas id="chart"></canvas>
</div>

</div>

<script>

function switchView(v){}

let chart;

async function loadData(){
 const res = await fetch("/api/dashboard");
 const data = await res.json();

 document.getElementById("total").innerText = data.total;

 if(chart) chart.destroy();

 chart = new Chart(document.getElementById("chart"), {
  type:"bar",
  data:{
   labels:Object.keys(data.subjectWise),
   datasets:[{
     data:Object.values(data.subjectWise),
     backgroundColor:"#8b5cf6"
   }]
  }
 });
}

loadData();

</script>

</body>
</html>`);
});
/* ================= START ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));

app.listen(PORT,()=>console.log("🚀 Server running"));