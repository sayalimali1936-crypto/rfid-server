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
app.get("/",(req,res)=>res.redirect("/login"));

/* =========================
   LOGIN
========================= */
app.get("/login",(req,res)=>{
res.send(`
<html>
<head>
<style>
body{background:#020617;color:white;font-family:Segoe UI;text-align:center;padding-top:100px}
input,select,button{padding:10px;margin:10px;border-radius:8px}
button{background:#6366f1;color:white;border:none}
</style>
</head>
<body>

<h1>🔐 Login</h1>

<select id="role">
<option value="teacher">Teacher</option>
<option value="hod">HOD</option>
</select><br>

<input id="id" placeholder="Enter Staff ID"><br>

<button onclick="login()">Login</button>

<script>
function login(){
 let role=document.getElementById("role").value;
 let id=document.getElementById("id").value;

 if(role==="teacher"){
  location="/dashboard?role=teacher&staff="+id;
 }else{
  location="/dashboard?role=hod";
 }
}
</script>

</body>
</html>
`);
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
   API (SMART)
========================= */
app.get("/api/dashboard",(req,res)=>{

 const {staff} = req.query;

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;

  return {
    date:p[0],
    role:p[2],
    name:p[3],
    className:p[5],
    subject:p[7]
  };
 }).filter(x=>x && x.role==="STUDENT");

 // teacher filter
 if(staff){
  let subjects=timetable
   .filter(t=>normalize(t.staff_id)===normalize(staff))
   .map(t=>t.subject);

  records=records.filter(r=>subjects.includes(r.subject));
 }

 let lectureMap={},studentWise={},subjectWise={},classWise={};

 records.forEach(r=>{
  lectureMap[r.date+"-"+r.subject]=true;
  studentWise[r.name]=(studentWise[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let actualLectures=Object.keys(lectureMap).length;
 let expectedLectures=timetable.length;

 let studentData={};
 Object.keys(studentWise).forEach(n=>{
  let p=(studentWise[n]/actualLectures)*100;
  studentData[n]={percent:p.toFixed(1),def:p<75};
 });

 res.json({actualLectures,expectedLectures,studentData,subjectWise,classWise});
});

/* =========================
   POWER BI DASHBOARD UI
========================= */
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{margin:0;font-family:Segoe UI;display:flex;background:#020617;color:white}

/* SIDEBAR */
.sidebar{
 width:230px;
 background:#020617;
 padding:20px;
 border-right:1px solid #334155;
}
.sidebar button{
 width:100%;
 padding:12px;
 margin:6px 0;
 border:none;
 border-radius:10px;
 background:#1e293b;
 color:white;
 cursor:pointer;
}
.sidebar button:hover{background:#6366f1}

/* MAIN */
.main{flex:1;padding:20px}

/* CARDS */
.cards{display:flex;gap:15px}
.card{
 flex:1;
 padding:20px;
 border-radius:12px;
 background:rgba(255,255,255,0.08);
 text-align:center;
 transition:0.3s;
}
.card:hover{transform:scale(1.05)}

/* GRID */
.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px}

.section{background:#1e293b;padding:20px;border-radius:12px}

/* TABLE */
table{width:100%;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
.def{color:red}
.ok{color:lime}
</style>
</head>

<body>

<div class="sidebar">
<h2>📊 Dashboard</h2>
<button onclick="location='/dashboard'">Home</button>
<button onclick="location='/login'">Logout</button>
</div>

<div class="main">

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Expected <h2 id="exp"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<div class="grid">
<div class="section"><canvas id="bar"></canvas></div>
<div class="section"><canvas id="pie"></canvas></div>
</div>

<div class="section"><canvas id="line"></canvas></div>

<div class="section">
<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="t"></tbody>
</table>
</div>

</div>

<script>
async function load(){

 let d=await fetch("/api/dashboard"+location.search).then(r=>r.json());

 lec.innerText=d.actualLectures;
 exp.innerText=d.expectedLectures;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels=Object.keys(d.subjectWise);
 let values=Object.values(d.subjectWise);

 new Chart(bar,{type:"bar",data:{labels,datasets:[{data:values}]}});

 new Chart(pie,{type:"doughnut",data:{labels,datasets:[{data:values}]}});

 new Chart(line,{type:"line",data:{labels,datasets:[{data:values}]}});

 let t=document.getElementById("t");
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
   START
========================= */
app.listen(PORT,()=>console.log("🚀 Server running"));