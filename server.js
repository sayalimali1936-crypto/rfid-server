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
   🎨 UI SECTION
============================================================ */
app.get("/dashboard",(req,res)=>{
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Smart Attendance Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{
 margin:0;
 font-family:Segoe UI;
 background:#0f172a;
 color:white;
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:240px;
 background:#020617;
 padding:20px;
}

.nav{
 padding:12px;
 margin:10px 0;
 background:#1e293b;
 border-radius:8px;
 cursor:pointer;
}

.nav:hover{background:#4f46e5}
.active{background:#4f46e5}

/* MAIN */
.main{
 flex:1;
 padding:20px;
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
 margin-bottom:20px;
}

.card{
 flex:1;
 padding:20px;
 background:#1e293b;
 border-radius:10px;
 text-align:center;
}

.big{font-size:24px}

/* TABLE */
table{
 width:100%;
 border-collapse:collapse;
}

td,th{
 padding:10px;
 border-bottom:1px solid #334155;
}

.red{color:#ef4444}
.green{color:#22c55e}

.view{display:none}
.view.active{display:block}
</style>

</head>

<body>

<div class="sidebar">
<h3>📊 Dashboard</h3>

<div class="nav active" onclick="show('home',this)">Home</div>
<div class="nav" onclick="show('faculty',this)">Faculty</div>
<div class="nav" onclick="show('hod',this)">HOD</div>
<div class="nav" onclick="show('principal',this)">Principal</div>

</div>

<div class="main">

<!-- HOME -->
<div id="home" class="view active">

<div class="cards">
<div class="card">Logs<div class="big" id="total"></div></div>
<div class="card">Students<div class="big" id="students"></div></div>
<div class="card">%<div class="big" id="percent"></div></div>
</div>

<canvas id="chart"></canvas>

</div>

<!-- FACULTY -->
<div id="faculty" class="view">

<input id="search" placeholder="Search student">
<select id="subject"></select>
<button onclick="load()">Apply</button>

<table>
<thead>
<tr><th>Name</th><th>Count</th><th>%</th><th>Status</th></tr>
</thead>
<tbody id="fTable"></tbody>
</table>

</div>

<!-- HOD -->
<div id="hod" class="view">

<select id="subject2"></select>
<button onclick="load()">Apply</button>

<table>
<thead>
<tr><th>Subject</th><th>Attendance</th></tr>
</thead>
<tbody id="hTable"></tbody>
</table>

</div>

<!-- PRINCIPAL -->
<div id="principal" class="view">

<div class="cards">
<div class="card" onclick="show('hod')">Computer</div>
<div class="card" onclick="show('hod')">Electrical</div>
<div class="card" onclick="show('hod')">Civil</div>
<div class="card" onclick="show('hod')">Mechanical</div>
<div class="card" onclick="show('hod')">ENTC</div>
<div class="card" onclick="show('hod')">First Year</div>
</div>

</div>

</div>

<script>

let chart;

function show(id,el){
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 document.getElementById(id).classList.add("active");

 document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));
 if(el) el.classList.add("active");
}

async function load(){

 const res=await fetch("/api/dashboard");
 const d=await res.json();

 let total=d.total;
 let students=Object.keys(d.studentWise).length || 1;
 let max=Math.max(...Object.values(d.studentWise));

 let percent=((total/(students*max))*100).toFixed(1);

 total && (totalEl=document.getElementById("total")).innerText=total;
 document.getElementById("students").innerText=students;
 document.getElementById("percent").innerText=percent+"%";

 let subjects=Object.keys(d.subjectWise);

 subject.innerHTML='<option value="">All</option>';
 subject2.innerHTML='<option value="">All</option>';

 subjects.forEach(s=>{
  subject.innerHTML+=\`<option>\${s}</option>\`;
  subject2.innerHTML+=\`<option>\${s}</option>\`;
 });

 /* CHART */
 if(chart) chart.destroy();

 chart=new Chart(document.getElementById("chart"),{
  type:"bar",
  data:{
   labels:subjects,
   datasets:[{data:Object.values(d.subjectWise),backgroundColor:"#4f46e5"}]
  }
 });

 /* FACULTY */
 let search=document.getElementById("search").value.toLowerCase();
 let f="";

 Object.entries(d.studentWise).forEach(([n,c])=>{

  if(search && !n.toLowerCase().includes(search)) return;

  let p=((c/max)*100).toFixed(1);
  let def=p<75;

  f+=\`<tr>
  <td>\${n}</td>
  <td>\${c}</td>
  <td>\${p}%</td>
  <td class="\${def?'red':'green'}">\${def?'Defaulter':'OK'}</td>
  </tr>\`;
 });

 fTable.innerHTML=f;

 /* HOD */
 let h="";
 let selected=subject2.value;

 Object.entries(d.subjectWise).forEach(([s,v])=>{
  if(selected && s!==selected) return;
  h+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });

 hTable.innerHTML=h;
}

load();

</script>

</body>
</html>`);
});
/* ================= START ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));

app.listen(PORT,()=>console.log("🚀 Server running"));