const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");

/* ================= INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const date=new Date().toISOString().slice(0,10);

 const csv=[date,"--","STUDENT","UNKNOWN",card,"--","--","--"].join(",")+"\n";
 fs.appendFileSync(csvPath,csv);

 res.send("OK");
});

/* ================= DATA ENGINE ================= */
function getData(){

 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 const today=new Date().toISOString().slice(0,10);

 let records=raw.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {
   date:p[0],
   name:p[3],
   className:p[5],
   subject:p[7]
  };
 }).filter(x=>x && x.name);

 let student={},subject={},classWise={},todayMap={},studentSubject={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subject[r.subject]=(subject[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;

  if(!studentSubject[r.name]) studentSubject[r.name]={};
  studentSubject[r.name][r.subject]=(studentSubject[r.name][r.subject]||0)+1;

  if(r.date===today) todayMap[r.name]=true;
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length||1;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let percent=(student[n]/totalLectures)*100;
  studentData[n]={
   percent:percent.toFixed(1),
   def:percent<75,
   today:todayMap[n]||false,
   subjects:studentSubject[n]
  };
 });

 return {studentData,subject,classWise,totalLectures};
}

/* ================= API ================= */
app.get("/api",(req,res)=>{
 res.json(getData());
});

/* ================= LOGIN ================= */
app.get("/",(req,res)=>{
res.send(`
<h2 style="text-align:center">Smart Attendance Login</h2>
<select id="role">
<option value="subject">Subject Teacher</option>
<option value="class">Class Teacher</option>
<option value="hod">HOD</option>
</select>
<br><br>
<button onclick="go()">Enter Dashboard</button>

<script>
function go(){
 let r=document.getElementById("role").value;
 location="/dashboard?role="+r;
}
</script>
`);
});

/* ================= DASHBOARD ================= */
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
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
 width:220px;
 background:#020617;
 padding:20px;
 border-right:1px solid #334155;
}
.sidebar h3{margin-bottom:10px}
.sidebar button{
 width:100%;
 padding:10px;
 margin:6px 0;
 border:none;
 border-radius:6px;
 background:#1e293b;
 color:white;
 cursor:pointer;
}
.sidebar button:hover{background:#6366f1}

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
 background:#1e293b;
 padding:20px;
 border-radius:10px;
 text-align:center;
}

/* CHART GRID */
.grid{
 display:grid;
 grid-template-columns:2fr 1fr;
 gap:20px;
}

/* TABLE */
table{
 width:100%;
 border-collapse:collapse;
 margin-top:20px;
}
td,th{
 padding:10px;
 border-bottom:1px solid #334155;
}
.def{color:#ef4444}
.ok{color:#22c55e}

/* REPORT */
.report{
 margin-top:20px;
 background:#1e293b;
 padding:15px;
 border-radius:10px;
}
</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>
<button onclick="load('subject')">Subject View</button>
<button onclick="load('class')">Class View</button>
<button onclick="load('hod')">HOD View</button>
<button onclick="generateReport()">Student Report</button>
<button onclick="window.print()">Export PDF</button>
</div>

<div class="main">

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Students <h2 id="stu"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<div class="grid">
<canvas id="bar"></canvas>
<canvas id="pie"></canvas>
</div>

<canvas id="line" style="margin-top:20px"></canvas>

<table>
<tr>
<th>Name</th>
<th>%</th>
<th>Today</th>
<th>Status</th>
</tr>
<tbody id="table"></tbody>
</table>

<div class="report" id="reportBox">
<h3>Student Report</h3>
<div id="reportContent">Select a student</div>
</div>

</div>

<script>

let dataStore;
let charts={};

async function load(view){

 const d=await fetch("/api").then(r=>r.json());
 dataStore=d;

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels=view==="hod"?Object.keys(d.classWise):Object.keys(d.subject);
 let values=view==="hod"?Object.values(d.classWise):Object.values(d.subject);

 updateChart("bar","bar",labels,values);
 updateChart("pie","doughnut",labels,values);
 updateChart("line","line",labels,values);

 let t=document.getElementById("table");
 t.innerHTML="";

 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr onclick="showReport('\${n}')">
    <td>\${n}</td>
    <td>\${v.percent}%</td>
    <td>\${v.today?'✔':'❌'}</td>
    <td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });
}

function updateChart(id,type,labels,data){
 if(charts[id]) charts[id].destroy();
 charts[id]=new Chart(document.getElementById(id),{
  type:type,
  data:{labels,datasets:[{data:data}]}
 });
}

function showReport(name){
 let s=dataStore.studentData[name];
 let html="<b>"+name+"</b><br>Overall: "+s.percent+"%<br><br>";

 for(let sub in s.subjects){
  html+=sub+" : "+s.subjects[sub]+"<br>";
 }

 document.getElementById("reportContent").innerHTML=html;
}

function generateReport(){
 let name=prompt("Enter student name");
 if(name) showReport(name);
}

load("subject");

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));