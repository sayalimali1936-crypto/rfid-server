const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE SETUP (UNCHANGED)
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
   LOAD CSV FILES (UNCHANGED)
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
   HELPERS (UNCHANGED)
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

function identifyCard(cardNo) {
  const student = students.find(s => normalize(s.card_no) === normalize(cardNo));
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(s => normalize(s.staff_card_no) === normalize(cardNo));
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN" };
}

function getIndianTime() {
  const d = new Date(new Date().getTime() + 19800000);
  return {
    date: d.toISOString().slice(0,10),
    time: d.toTimeString().slice(0,5)
  };
}

/* =========================
   RFID LOG (UNCHANGED)
========================= */

app.get("/log",(req,res)=>{
  const card=req.query.card_no;
  if(!card) return res.send("NO_CARD");

  const id=identifyCard(card);
  if(id.type==="UNKNOWN") return res.send("UNKNOWN");

  const {date,time}=getIndianTime();

  const csv=[date,time,id.type,
    id.data?.student_name||id.data?.staff_name,
    card,
    id.data?.class||"",
    id.data?.batch||"",
    "Subject"
  ].join(",")+"\n";

  fs.appendFile(csvPath,csv,()=>{});
  res.send("OK");
});

/* =========================
   LOGIN
========================= */

app.get("/login",(req,res)=>{
res.send(`
<h2 style="text-align:center">Login</h2>
<div style="text-align:center">
<select id="role">
<option value="teacher">Teacher</option>
<option value="hod">HOD</option>
</select><br><br>
<input id="pass" type="password"><br><br>
<button onclick="go()">Login</button>
</div>

<script>
function go(){
 if(document.getElementById("pass").value=="1234")
 location="/dashboard";
 else alert("Wrong");
}
</script>
`);
});

/* =========================
   ADVANCED API
========================= */

app.get("/api/dashboard",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records=data.map(l=>{
  let [d,t,r,n,c,cl,b,s]=l.split(",");
  return {d,n,cl,b,s};
 }).filter(x=>x.n);

 let student={},subject={},classWise={};

 records.forEach(r=>{
  student[r.n]=(student[r.n]||0)+1;
  subject[r.s]=(subject[r.s]||0)+1;
  classWise[r.cl]=(classWise[r.cl]||0)+1;
 });

 let totalLectures=new Set(records.map(r=>r.d+r.s)).size;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/totalLectures)*100;
  studentData[n]={count:student[n],percent:p.toFixed(1),def:p<75};
 });

 res.json({studentData,subject,classWise,totalLectures});
});

/* =========================
   SUBJECT ANALYSIS
========================= */

app.get("/api/subject-analysis",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let result={};

 data.forEach(l=>{
  let [d,t,r,n,c,cl,b,s]=l.split(",");
  if(!n) return;

  if(!result[n]) result[n]={};
  result[n][s]=(result[n][s]||0)+1;
 });

 res.json(result);
});

/* =========================
   REPORT (PDF SIMPLE)
========================= */

app.get("/report",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8");
 res.send("<pre>"+data+"</pre>");
});

/* =========================
   DASHBOARD UI (FINAL)
========================= */

app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{
 margin:0;
 font-family:'Segoe UI';
 display:flex;
 background:linear-gradient(135deg,#020617,#0f172a);
 color:white;
}

/* SIDEBAR */
.sidebar{
 width:240px;
 background:linear-gradient(180deg,#1e3a8a,#020617);
 padding:20px;
 box-shadow:2px 0 10px rgba(0,0,0,0.5);
}

.sidebar h2{
 text-align:center;
 margin-bottom:20px;
}

.sidebar button{
 width:100%;
 padding:12px;
 margin:6px 0;
 border:none;
 border-radius:10px;
 background:#6366f1;
 color:white;
 cursor:pointer;
 transition:0.3s;
}

.sidebar button:hover{
 background:#4f46e5;
 transform:translateX(5px);
}

/* MAIN */
.main{
 flex:1;
 padding:25px;
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
}

.card{
 flex:1;
 background:rgba(255,255,255,0.08);
 backdrop-filter:blur(12px);
 padding:20px;
 border-radius:16px;
 text-align:center;
 box-shadow:0 5px 20px rgba(0,0,0,0.4);
 transition:0.3s;
}

.card:hover{
 transform:scale(1.05);
}

/* SECTIONS */
.section{
 margin-top:20px;
 background:rgba(255,255,255,0.05);
 padding:20px;
 border-radius:16px;
 box-shadow:0 5px 20px rgba(0,0,0,0.4);
}

/* TABLE */
table{
 width:100%;
 border-collapse:collapse;
 margin-top:10px;
}

th{
 text-align:left;
 padding:12px;
 color:#94a3b8;
}

td{
 padding:10px;
 border-bottom:1px solid #334155;
}

tr:hover{
 background:rgba(255,255,255,0.05);
}

.def{ color:#ef4444; font-weight:bold; }
.ok{ color:#22c55e; }

/* TITLE */
.title{
 font-size:22px;
 margin-bottom:10px;
}

/* CANVAS FIX */
canvas{
 background:#020617;
 border-radius:12px;
 padding:10px;
}
</style>
</head>

<body>

<div class="sidebar">
<h2>📊 Smart Dashboard</h2>

<button onclick="setView('subject')">📘 Subject</button>
<button onclick="setView('class')">👩‍🏫 Class</button>
<button onclick="setView('hod')">🏫 HOD</button>

<hr>

<button onclick="exportData()">⬇ Export CSV</button>
</div>

<div class="main">

<div class="cards">
 <div class="card">
   <div class="title">📚 Lectures</div>
   <h2 id="lec"></h2>
 </div>
 <div class="card">
   <div class="title">👨‍🎓 Students</div>
   <h2 id="stu"></h2>
 </div>
 <div class="card">
   <div class="title">⚠ Defaulters</div>
   <h2 id="def"></h2>
 </div>
</div>

<div class="section">
 <div class="title">📊 Analytics</div>
 <canvas id="bar"></canvas>
</div>

<div class="section">
 <div class="title">📈 Distribution</div>
 <canvas id="pie"></canvas>
</div>

<div class="section">
 <div class="title">📋 Student Report</div>
 <table>
  <thead>
   <tr><th>Name</th><th>Attendance %</th><th>Status</th></tr>
  </thead>
  <tbody id="table"></tbody>
 </table>
</div>

</div>

<script>
let view="subject";
let barChart,pieChart;

function setView(v){
 view=v;
 load();
}

async function load(){
 let d=await fetch("/api/dashboard").then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;
 document.getElementById("stu").innerText=Object.keys(d.studentData).length;

 let defCount=Object.values(d.studentData).filter(x=>x.def).length;
 document.getElementById("def").innerText=defCount;

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
 barChart=new Chart(bar,{
  type:"bar",
  data:{
    labels:labels,
    datasets:[{
      label:"Attendance",
      data:values,
      backgroundColor:"#6366f1"
    }]
  }
 });

 if(pieChart) pieChart.destroy();
 pieChart=new Chart(pie,{
  type:"doughnut",
  data:{
    labels:labels,
    datasets:[{
      data:values,
      backgroundColor:["#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6"]
    }]
  }
 });

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
});/* =========================
   START SERVER
========================= */

app.listen(PORT,()=>console.log("Server running"));