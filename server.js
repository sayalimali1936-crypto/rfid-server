const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* ================= DATABASE ================= */
const dbPath = path.join(__dirname, "attendance.db");
const csvPath = path.join(__dirname, "attendance.csv");

const db = new sqlite3.Database(dbPath);

db.run(`CREATE TABLE IF NOT EXISTS attendance (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 card_no TEXT,
 timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

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

/* ================= ANALYTICS ================= */
function getData(){

 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let today=new Date().toISOString().slice(0,10);

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

 let student={},subject={},classWise={},todayMap={};
 let studentSubject={};

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
<h2 style="text-align:center">Login</h2>
<select id="role">
<option value="subject">Subject Teacher</option>
<option value="class">Class Teacher</option>
<option value="hod">HOD</option>
</select>
<br><br>
<button onclick="go()">Enter</button>

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
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}
.sidebar{width:220px;background:#020617;padding:20px}
.sidebar button{width:100%;padding:10px;margin:5px;background:#1e293b;color:white;border:none}
.main{flex:1;padding:20px}
.cards{display:flex;gap:10px}
.card{flex:1;padding:20px;background:#1e293b;border-radius:10px;text-align:center}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px}
table{width:100%;border-collapse:collapse;margin-top:20px}
td,th{padding:10px;border-bottom:1px solid #334155}
.def{color:red}
.ok{color:lime}
</style>

</head>

<body>

<div class="sidebar">
<button onclick="load('subject')">Subject</button>
<button onclick="load('class')">Class</button>
<button onclick="load('hod')">HOD</button>
<button onclick="report()">Student Report</button>
<button onclick="exportPDF()">Export PDF</button>
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

<canvas id="line"></canvas>

<table>
<tr><th>Name</th><th>%</th><th>Today</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

let dataGlobal;

async function load(view){

 let d=await fetch("/api").then(r=>r.json());
 dataGlobal=d;

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels = view==="hod" ? Object.keys(d.classWise) : Object.keys(d.subject);
 let values = view==="hod" ? Object.values(d.classWise) : Object.values(d.subject);

 new Chart(bar,{type:"bar",data:{labels,datasets:[{data:values}]}});

 let t=document.getElementById("table");
 t.innerHTML="";

 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr>
    <td>\${n}</td>
    <td>\${v.percent}%</td>
    <td>\${v.today?'✔':'❌'}</td>
    <td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });
}

function report(){
 let name=prompt("Enter student name");
 let s=dataGlobal.studentData[name];

 if(!s) return alert("No data");

 let html="<h2>"+name+"</h2>";
 html+="<p>Overall: "+s.percent+"%</p>";

 html+="<h3>Subjects</h3><ul>";
 for(let sub in s.subjects){
  html+="<li>"+sub+": "+s.subjects[sub]+"</li>";
 }
 html+="</ul>";

 let w=window.open();
 w.document.write(html);
}

function exportPDF(){
 window.print();
}

load("subject");

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));
