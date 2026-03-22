const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE
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
 const d = new Date(new Date().getTime()+19800000);
 const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 return {
  date:d.toISOString().slice(0,10),
  time:d.toTimeString().slice(0,5),
  day:days[d.getDay()]
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

/* =========================
   ROUTES
========================= */

app.get("/",(req,res)=>res.send("RFID Running"));
app.get("/dashboard",(req,res)=>{
  res.redirect("/home");
});

/* =========================
   LOG (UNCHANGED)
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
   HOME PAGE
========================= */
app.get("/home",(req,res)=>{
res.send(`
<h1 style="text-align:center">📊 Dashboard</h1>
<div style="text-align:center">
<button onclick="go('/subject')">Subject</button>
<button onclick="go('/class')">Class</button>
<button onclick="go('/hod')">HOD</button>
</div>

<script>
function go(x){location=x}
</script>
`);
});

/* =========================
   API
========================= */
app.get("/api/data",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split(/\\r?\\n/).slice(1);

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
   VIEW GENERATOR
========================= */
function viewPage(title,mode){
return `
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
 animation:fadeIn 0.8s ease;
}

@keyframes fadeIn{
 from{opacity:0;transform:translateY(10px)}
 to{opacity:1;transform:translateY(0)}
}

/* SIDEBAR */
.sidebar{
 width:230px;
 background:linear-gradient(#1e293b,#020617);
 padding:20px;
 box-shadow:2px 0 15px rgba(0,0,0,0.5);
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
 transform:translateX(6px);
}

/* MAIN */
.main{
 flex:1;
 padding:20px;
}

/* KPI CARDS */
.cards{
 display:flex;
 gap:15px;
}

.card{
 flex:1;
 padding:20px;
 border-radius:16px;
 background:rgba(255,255,255,0.08);
 backdrop-filter:blur(12px);
 text-align:center;
 transition:0.3s;
 box-shadow:0 5px 20px rgba(0,0,0,0.4);
}

.card:hover{
 transform:translateY(-5px) scale(1.05);
}

.icon{
 font-size:24px;
 margin-bottom:5px;
}

/* GRID */
.grid{
 display:grid;
 grid-template-columns:2fr 1fr;
 gap:20px;
 margin-top:20px;
}

.section{
 background:rgba(255,255,255,0.05);
 padding:20px;
 border-radius:16px;
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

<button onclick="go('/home')">🏠 Home</button>
<button onclick="go('/subject')">📘 Subject</button>
<button onclick="go('/class')">👩‍🏫 Class</button>
<button onclick="go('/hod')">🏫 HOD</button>

<hr>

<button onclick="exportData()">⬇ Export</button>
</div>

<!-- MAIN -->
<div class="main">

<h2>${title}</h2>

<div class="cards">
<div class="card">
<div class="icon">📚</div>
Lectures<br><h2 id="lec"></h2>
</div>

<div class="card">
<div class="icon">👨‍🎓</div>
Students<br><h2 id="stu"></h2>
</div>

<div class="card">
<div class="icon">⚠️</div>
Defaulters<br><h2 id="def"></h2>
</div>
</div>

<div class="grid">
<div class="section"><canvas id="bar"></canvas></div>
<div class="section"><canvas id="pie"></canvas></div>
</div>

<div class="section" style="margin-top:20px">
<canvas id="line"></canvas>
</div>

<div class="section">
<table>
<thead><tr><th>Name</th><th>%</th><th>Status</th></tr></thead>
<tbody id="table"></tbody>
</table>
</div>

</div>

<!-- FILTER PANEL -->
<div class="filters">
<h3>Filters</h3>

<select id="class">
<option value="">All Class</option>
<option>SE</option><option>TE</option><option>BE</option>
</select>

<select id="batch">
<option value="">All Batch</option>
<option>A</option><option>B</option><option>C</option>
</select>

<select id="period">
<option value="">All Time</option>
<option value="week">Weekly</option>
<option value="month">Monthly</option>
</select>

<button onclick="load()">Apply</button>
</div>

<script>
let barChart,pieChart,lineChart;

function go(x){window.location=x}

async function load(){

 let url="/api/data";

 let d=await fetch(url).then(r=>r.json());

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels,values;

 if("${mode}"==="subject"){
  labels=Object.keys(d.subjectWise);
  values=Object.values(d.subjectWise);
 }
 else if("${mode}"==="class"){
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
  data:{labels:labels,datasets:[{data:values,backgroundColor:"#6366f1"}]}
 });

 if(pieChart) pieChart.destroy();
 pieChart=new Chart(document.getElementById("pie"),{
  type:"doughnut",
  data:{labels:labels,datasets:[{data:values}]}
 });

 if(lineChart) lineChart.destroy();
 lineChart=new Chart(document.getElementById("line"),{
  type:"line",
  data:{labels:labels,datasets:[{data:values,borderColor:"#22c55e"}]}
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
`;
}

/* =========================
   VIEWS
========================= */
app.get("/subject",(req,res)=>res.send(viewPage("Subject View","subject")));
app.get("/class",(req,res)=>res.send(viewPage("Class View","class")));
app.get("/hod",(req,res)=>res.send(viewPage("HOD View","hod")));

/* =========================
   START
========================= */
app.listen(PORT,()=>console.log("🚀 Server running"));