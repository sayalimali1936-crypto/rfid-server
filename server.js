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
body{margin:0;display:flex;font-family:Segoe UI;background:#020617;color:white}

/* SIDEBAR */
.sidebar{
 width:250px;
 background:linear-gradient(#1e293b,#020617);
 padding:20px;
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
}

/* MAIN */
.main{flex:1;padding:20px}

/* CARDS */
.cards{display:flex;gap:15px}
.card{
 flex:1;
 background:rgba(255,255,255,0.08);
 padding:20px;
 border-radius:12px;
 text-align:center;
 transition:0.3s;
}
.card:hover{transform:scale(1.05)}

/* SECTIONS */
.section{
 margin-top:20px;
 background:#0f172a;
 padding:20px;
 border-radius:12px;
}

/* GRID */
.grid{
 display:grid;
 grid-template-columns:1fr 1fr;
 gap:20px;
}

/* TABLE */
table{width:100%;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
.def{color:red}
.ok{color:#22c55e}
</style>
</head>

<body>

<div class="sidebar">
<h2>📊 Dashboard</h2>

<button onclick="view='subject';load()">Subject Teacher</button>
<button onclick="view='class';load()">Class Teacher</button>
<button onclick="view='hod';load()">HOD</button>

<hr>
<button onclick="exportData()">Export CSV</button>
</div>

<div class="main">

<!-- CARDS -->
<div class="cards">
 <div class="card">Lectures<br><h2 id="lec"></h2></div>
 <div class="card">Students<br><h2 id="stu"></h2></div>
 <div class="card">Defaulters<br><h2 id="def"></h2></div>
</div>

<!-- GRAPHS -->
<div class="grid">
 <div class="section">
  <canvas id="chart1"></canvas>
 </div>
 <div class="section">
  <canvas id="chart2"></canvas>
 </div>
</div>

<div class="section">
 <canvas id="chart3"></canvas>
</div>

<!-- TABLE -->
<div class="section">
<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>
</div>

</div>

<script>
let view="subject";
let c1,c2,c3;

async function load(){
 let d=await fetch("/api/dashboard").then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;
 document.getElementById("stu").innerText=Object.keys(d.studentData).length;
 document.getElementById("def").innerText=
  Object.values(d.studentData).filter(x=>x.def).length;

 let labels1,values1,labels2,values2,labels3,values3;

 if(view==="subject"){
  labels1=Object.keys(d.subject);
  values1=Object.values(d.subject);

  labels2=Object.keys(d.studentData);
  values2=Object.values(d.studentData).map(x=>x.percent);

  labels3=Object.keys(d.subject);
  values3=Object.values(d.subject);
 }

 else if(view==="class"){
  labels1=Object.keys(d.subject);
  values1=Object.values(d.subject);

  labels2=Object.keys(d.studentData);
  values2=Object.values(d.studentData).map(x=>x.count);

  labels3=Object.keys(d.subject);
  values3=Object.values(d.subject);
 }

 else{
  labels1=Object.keys(d.classWise);
  values1=Object.values(d.classWise);

  labels2=Object.keys(d.classWise);
  values2=Object.values(d.classWise);

  labels3=Object.keys(d.classWise);
  values3=Object.values(d.classWise);
 }

 if(c1) c1.destroy();
 c1=new Chart(chart1,{
  type:"bar",
  data:{labels:labels1,datasets:[{data:values1}]}
 });

 if(c2) c2.destroy();
 c2=new Chart(chart2,{
  type:"doughnut",
  data:{labels:labels2,datasets:[{data:values2}]}
 });

 if(c3) c3.destroy();
 c3=new Chart(chart3,{
  type:"line",
  data:{labels:labels3,datasets:[{data:values3}]}
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