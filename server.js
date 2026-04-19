const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

/* ================= FILE PATHS ================= */
const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");

/* ================= INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= LOAD CSV ================= */
function loadCSV(file){
 try{
  const data=fs.readFileSync(file,"utf8");
  const lines=data.trim().split(/\r?\n/);
  const headers=lines.shift().split(",");
  return lines.map(l=>{
   let obj={};
   l.split(",").forEach((v,i)=>obj[headers[i]] = v);
   return obj;
  });
 }catch(e){ return []; }
}

const students = loadCSV(studentsPath);
const timetable = loadCSV(timetablePath);

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const student = students.find(s=>s.card_no===card);
 if(!student) return res.send("UNKNOWN");

 const now=new Date();
 const day=now.toLocaleString("en-US",{weekday:"long"});

 const slot=timetable.find(t=>t.day===day && t.class===student.class);
 if(!slot) return res.send("NO_SLOT");

 const csv=[
  now.toISOString().slice(0,10),
  now.toTimeString().slice(0,5),
  "STUDENT",
  student.student_name,
  card,
  student.class,
  student.batch,
  slot.subject
 ].join(",")+"\n";

 fs.appendFileSync(csvPath,csv);
 res.send("OK");
});

/* ================= BASIC API ================= */
app.get("/api/dashboard",(req,res)=>{
 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let studentWise={},subjectWise={};

 raw.forEach(l=>{
  let p=l.split(",");
  if(p.length<8) return;

  studentWise[p[3]]=(studentWise[p[3]]||0)+1;
  subjectWise[p[7]]=(subjectWise[p[7]]||0)+1;
 });

 res.json({
  total:raw.length,
  studentWise,
  subjectWise
 });
});

/* ================= ADVANCED API ================= */
app.get("/api/advanced",(req,res)=>{

 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let studentSubject={},subjectLectures={};

 raw.forEach(l=>{
  let p=l.split(",");
  if(p.length<8) return;

  let name=p[3];
  let subject=p[7];

  let key=name+"_"+subject;

  studentSubject[key]=(studentSubject[key]||0)+1;
  subjectLectures[subject]=(subjectLectures[subject]||0)+1;
 });

 let report={};

 Object.keys(studentSubject).forEach(k=>{
  let [name,subject]=k.split("_");

  let attended=studentSubject[k];
  let total=subjectLectures[subject]||1;

  let percent=(attended/total)*100;

  if(!report[name]) report[name]=[];

  report[name].push({
    subject,
    attended,
    total,
    percent:percent.toFixed(1),
    defaulter:percent<75
  });
 });

 res.json({report,subjectLectures});
});

/* ================= LOGIN ================= */
app.get("/login",(req,res)=>{
 res.send(`
 <h2>Teacher Login</h2>
 <input id="id" placeholder="Enter Staff ID">
 <button onclick="go()">Login</button>

 <script>
 function go(){
  let id=document.getElementById("id").value;
  location="/dashboard?teacher="+id;
 }
 </script>
 `);
});

/* ================= DASHBOARD ================= */
app.get("/dashboard",(req,res)=>{
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Smart Attendance</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://unpkg.com/lucide@latest"></script>

<style>
:root{
 --bg:#0b1220;
 --card:#111827;
 --accent:#2563eb;
 --text:#e5e7eb;
 --muted:#94a3b8;
}

body{
 margin:0;
 font-family:Segoe UI;
 background:linear-gradient(135deg,#0b1220,#020617);
 color:var(--text);
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:250px;
 padding:20px;
 background:#020617;
 border-right:1px solid #1e293b;
}

.logo{
 font-size:18px;
 font-weight:600;
 margin-bottom:25px;
 display:flex;
 align-items:center;
 gap:8px;
}

.nav{
 display:flex;
 align-items:center;
 gap:10px;
 padding:12px;
 margin:8px 0;
 border-radius:8px;
 cursor:pointer;
 transition:.3s;
}

.nav:hover{
 background:rgba(37,99,235,0.2);
 transform:translateX(4px);
}

.active{
 background:var(--accent);
}

/* MAIN */
.main{
 flex:1;
 padding:30px;
 animation:fade .5s ease;
}

@keyframes fade{
 from{opacity:0; transform:translateY(10px)}
 to{opacity:1; transform:translateY(0)}
}

/* HEADER */
.header{
 font-size:24px;
 margin-bottom:20px;
}

/* CARDS */
.cards{
 display:flex;
 gap:20px;
 margin-bottom:25px;
}

.card{
 flex:1;
 padding:20px;
 border-radius:14px;
 background:rgba(255,255,255,0.05);
 backdrop-filter:blur(10px);
 transition:.3s;
 position:relative;
 overflow:hidden;
}

.card:hover{
 transform:translateY(-5px);
 box-shadow:0 10px 30px rgba(0,0,0,0.4);
}

.card h3{
 font-size:13px;
 color:var(--muted);
 margin:0;
}

.value{
 font-size:28px;
 margin-top:8px;
}

/* TABLE */
.table{
 background:var(--card);
 border-radius:14px;
 overflow:hidden;
}

table{
 width:100%;
 border-collapse:collapse;
}

th{
 background:#020617;
 color:var(--muted);
 padding:12px;
 text-align:left;
}

td{
 padding:12px;
 border-top:1px solid #1e293b;
 transition:.2s;
}

tr:hover td{
 background:rgba(37,99,235,0.1);
}

.red{color:#ef4444}
.green{color:#22c55e}

/* CHART */
.chart-box{
 margin-top:20px;
 padding:20px;
 background:var(--card);
 border-radius:14px;
}

/* VIEW */
.view{display:none}
.view.active{display:block}
</style>
</head>

<body>

<div class="sidebar">
<div class="logo">
<i data-lucide="layout-dashboard"></i> System
</div>

<div class="nav active" onclick="switchView('home',this)">
<i data-lucide="home"></i> Dashboard
</div>

<div class="nav" onclick="switchView('faculty',this)">
<i data-lucide="users"></i> Faculty
</div>

<div class="nav" onclick="switchView('hod',this)">
<i data-lucide="building"></i> HOD
</div>

</div>

<div class="main">

<!-- HOME -->
<div id="home" class="view active">

<div class="header">Overview</div>

<div class="cards">
<div class="card">
<h3>Total Subjects</h3>
<div class="value" id="subjects"></div>
</div>

<div class="card">
<h3>Total Students</h3>
<div class="value" id="students"></div>
</div>

<div class="card">
<h3>Defaulters</h3>
<div class="value" id="def"></div>
</div>
</div>

<div class="chart-box">
<canvas id="chart"></canvas>
</div>

</div>

<!-- FACULTY -->
<div id="faculty" class="view">

<div class="header">Student Report</div>

<div class="table">
<table>
<thead>
<tr><th>Name</th><th>Subject</th><th>%</th><th>Status</th></tr>
</thead>
<tbody id="fTable"></tbody>
</table>
</div>

</div>

<!-- HOD -->
<div id="hod" class="view">

<div class="header">Subject Summary</div>

<div class="table">
<table>
<thead>
<tr><th>Subject</th><th>Lectures</th></tr>
</thead>
<tbody id="hTable"></tbody>
</table>
</div>

</div>

</div>

<script>
lucide.createIcons();

let chart;

function switchView(id,el){
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 document.getElementById(id).classList.add("active");

 document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));
 if(el) el.classList.add("active");
}

async function load(){

 const res=await fetch("/api/advanced");
 const d=await res.json();

 let subjects=Object.keys(d.subjectLectures).length;
 let students=Object.keys(d.report).length;
 let def=0;

 let f="";

 Object.entries(d.report).forEach(([name,list])=>{
  list.forEach(s=>{
   if(s.defaulter) def++;

   f+=\`<tr>
   <td>\${name}</td>
   <td>\${s.subject}</td>
   <td>\${s.percent}%</td>
   <td class="\${s.defaulter?'red':'green'}">\${s.defaulter?'Defaulter':'OK'}</td>
   </tr>\`;
  });
 });

 subjectsEl = document.getElementById("subjects");
 studentsEl = document.getElementById("students");
 defEl = document.getElementById("def");

 subjectsEl.innerText=subjects;
 studentsEl.innerText=students;
 defEl.innerText=def;

 fTable.innerHTML=f;

 let h="";
 Object.entries(d.subjectLectures).forEach(([s,v])=>{
  h+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });

 hTable.innerHTML=h;

 if(chart) chart.destroy();

 chart=new Chart(document.getElementById("chart"),{
  type:"bar",
  data:{
   labels:Object.keys(d.subjectLectures),
   datasets:[{
     data:Object.values(d.subjectLectures),
     backgroundColor:"#2563eb",
     borderRadius:6
   }]
  },
  options:{
   plugins:{legend:{display:false}},
   scales:{y:{beginAtZero:true}}
  }
 });

}

load();
</script>

</body>
</html>`);
});

/* ================= START ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));
app.listen(PORT,()=>console.log("🚀 Server running"));