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
 background:#0f172a;
 color:white;
}

/* SIDEBAR */
.sidebar{
 width:230px;
 background:linear-gradient(#1e293b,#020617);
 padding:20px;
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
 border-radius:8px;
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
 padding:20px;
}

/* KPI CARDS */
.kpi{
 display:flex;
 gap:15px;
}

.card{
 flex:1;
 padding:20px;
 border-radius:12px;
 background:rgba(255,255,255,0.08);
 backdrop-filter:blur(10px);
 box-shadow:0 5px 20px rgba(0,0,0,0.3);
 text-align:center;
 transition:0.3s;
}
.card:hover{transform:scale(1.05)}

.card h2{margin:10px 0}

/* GRID */
.grid{
 display:grid;
 grid-template-columns:2fr 1fr;
 gap:20px;
 margin-top:20px;
}

/* FILTER PANEL */
.filters{
 width:220px;
 background:#020617;
 padding:15px;
 border-left:1px solid #334155;
}

select{
 width:100%;
 padding:8px;
 margin:8px 0;
 border-radius:6px;
}

/* TABLE */
table{
 width:100%;
 border-collapse:collapse;
 margin-top:10px;
}
th,td{
 padding:10px;
 border-bottom:1px solid #334155;
}

.def{color:#ef4444}
.ok{color:#22c55e}
</style>
</head>

<body>

<!-- SIDEBAR -->
<div class="sidebar">
<h2>📊 Dashboard</h2>

<button onclick="setView('subject')">📘 Subject</button>
<button onclick="setView('class')">👩‍🏫 Class</button>
<button onclick="setView('hod')">🏫 HOD</button>

<hr>
<button onclick="exportData()">⬇ Export</button>
</div>

<!-- MAIN -->
<div class="main">

<!-- KPI -->
<div class="kpi">
 <div class="card">
   <h3>📚 Lectures</h3>
   <h2 id="lec"></h2>
 </div>
 <div class="card">
   <h3>👨‍🎓 Students</h3>
   <h2 id="stu"></h2>
 </div>
 <div class="card">
   <h3>⚠ Defaulters</h3>
   <h2 id="def"></h2>
 </div>
</div>

<!-- GRAPHS -->
<div class="grid">
 <div class="card">
  <canvas id="bar"></canvas>
 </div>
 <div class="card">
  <canvas id="pie"></canvas>
 </div>
</div>

<div class="card" style="margin-top:20px">
 <canvas id="line"></canvas>
</div>

<!-- TABLE -->
<div class="card" style="margin-top:20px">
<table>
<thead>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
</thead>
<tbody id="table"></tbody>
</table>
</div>

</div>

<!-- FILTER PANEL -->
<div class="filters">
<h3>Filters</h3>

<select id="class">
<option value="">All Class</option>
<option>SE</option>
<option>TE</option>
<option>BE</option>
</select>

<select id="batch">
<option value="">All Batch</option>
<option>SE-1</option><option>SE-2</option><option>SE-3</option>
<option>TE-1</option><option>TE-2</option><option>TE-3</option>
<option>BE-1</option><option>BE-2</option><option>BE-3</option>
</select>

<select id="period">
<option value="">All Time</option>
<option value="week">Weekly</option>
<option value="month">Monthly</option>
</select>

<button onclick="load()">Apply</button>
</div>

<script>
let view="subject";
let barChart,pieChart,lineChart;

function setView(v){
 view=v;
 load();
}

async function load(){
 let url="/api/dashboard?";
 url+="classFilter="+document.getElementById("class").value+"&";
 url+="batchFilter="+document.getElementById("batch").value+"&";
 url+="period="+document.getElementById("period").value;

 let d=await fetch(url).then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;
 document.getElementById("stu").innerText=Object.keys(d.studentData).length;
 document.getElementById("def").innerText=
  Object.values(d.studentData).filter(x=>x.def).length;

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
 pieChart=new Chart(pie,{type:"doughnut",data:{labels:labels,datasets:[{data:values}]}});

 if(lineChart) lineChart.destroy();
 lineChart=new Chart(line,{type:"line",data:{labels:labels,datasets:[{data:values}]}});

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