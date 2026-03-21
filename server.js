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
body{margin:0;display:flex;background:#020617;color:white;font-family:Segoe UI}
.sidebar{width:240px;background:#1e293b;padding:20px}
.sidebar button{width:100%;margin:5px;padding:10px;background:#6366f1;border:none;color:white;border-radius:6px}
.main{flex:1;padding:20px}

.card{background:#111827;padding:20px;margin:10px;border-radius:10px}
.def{color:red}
.ok{color:#22c55e}
</style>
</head>

<body>

<div class="sidebar">
<button onclick="view='subject';load()">Subject</button>
<button onclick="view='class';load()">Class</button>
<button onclick="view='hod';load()">HOD</button>

<hr>
<button onclick="window.location='/report'">Report</button>
<button onclick="window.location='/download'">Export</button>
</div>

<div class="main">

<div class="card">
<h3>Total Lectures: <span id="lec"></span></h3>
</div>

<canvas id="chart"></canvas>

<div class="card">
<table id="table"></table>
</div>

</div>

<script>
let view="subject",chart;

async function load(){
 let d=await fetch("/api/dashboard").then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;

 let labels,values;

 if(view=="subject"){
  labels=Object.keys(d.subject);
  values=Object.values(d.subject);
 }
 else if(view=="class"){
  labels=Object.keys(d.studentData);
  values=Object.values(d.studentData).map(x=>x.count);
 }
 else{
  labels=Object.keys(d.classWise);
  values=Object.values(d.classWise);
 }

 if(chart) chart.destroy();
 chart=new Chart(document.getElementById("chart"),{
  type:"bar",
  data:{labels:labels,datasets:[{data:values}]}
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

load();
</script>

</body>
</html>
`);
});

/* =========================
   START SERVER
========================= */

app.listen(PORT,()=>console.log("Server running"));