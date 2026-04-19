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
<title>Smart Attendance System</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://unpkg.com/lucide@latest"></script>

<style>
body{
 margin:0;
 font-family:Segoe UI;
 background:linear-gradient(135deg,#020617,#0f172a);
 color:#e2e8f0;
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:250px;
 background:#020617;
 padding:20px;
 border-right:1px solid #1e293b;
}

.logo{
 font-size:18px;
 margin-bottom:20px;
 display:flex;
 align-items:center;
 gap:10px;
}

.nav{
 display:flex;
 gap:10px;
 padding:12px;
 margin:8px 0;
 border-radius:8px;
 cursor:pointer;
 transition:.3s;
}

.nav:hover{
 background:#1e293b;
 transform:translateX(5px);
}

.active{
 background:#2563eb;
}

/* MAIN */
.main{
 flex:1;
 padding:25px;
 animation:fade .4s ease;
}

@keyframes fade{
 from{opacity:0; transform:translateY(10px)}
 to{opacity:1}
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
 margin-bottom:20px;
}

.card{
 flex:1;
 background:rgba(255,255,255,0.05);
 padding:20px;
 border-radius:12px;
 backdrop-filter:blur(10px);
 transition:.3s;
}

.card:hover{
 transform:translateY(-5px);
}

.card h3{
 margin:0;
 font-size:13px;
 color:#94a3b8;
}

.value{
 font-size:26px;
 margin-top:8px;
}

/* TABLE */
table{
 width:100%;
 border-collapse:collapse;
 margin-top:20px;
}

th,td{
 padding:10px;
 border-bottom:1px solid #1e293b;
}

tr:hover{
 background:#1e293b;
}

.red{color:#ef4444}
.green{color:#22c55e}

/* VIEW */
.view{display:none}
.view.active{display:block}

/* INPUT */
input,select{
 padding:8px;
 border-radius:6px;
 margin-right:10px;
 margin-bottom:10px;
}
</style>
</head>

<body>

<div class="sidebar">

<div class="logo">
<i data-lucide="layout-dashboard"></i> Attendance
</div>

<select id="classFilter">
<option value="">All Classes</option>
<option>SE</option>
<option>TE</option>
<option>BE</option>
</select>

<div class="nav active" onclick="switchView('dashboard',this)">
<i data-lucide="home"></i> Dashboard
</div>

<div class="nav" onclick="switchView('faculty',this)">
<i data-lucide="users"></i> Faculty
</div>

<div class="nav" onclick="switchView('hod',this)">
<i data-lucide="building"></i> HOD
</div>

<div class="nav" onclick="switchView('principal',this)">
<i data-lucide="graduation-cap"></i> Principal
</div>

</div>

<div class="main">

<!-- DASHBOARD -->
<div id="dashboard" class="view active">

<div class="cards">
<div class="card"><h3>Present</h3><div class="value" id="present"></div></div>
<div class="card"><h3>Absent</h3><div class="value" id="absent"></div></div>
<div class="card"><h3>Attendance %</h3><div class="value" id="percent"></div></div>
</div>

<canvas id="chart"></canvas>

</div>

<!-- FACULTY -->
<div id="faculty" class="view">

<input id="search" placeholder="Search Student...">

<table>
<thead>
<tr><th>Name</th><th>Subject</th><th>%</th><th>Status</th></tr>
</thead>
<tbody id="facultyTable"></tbody>
</table>

</div>

<!-- HOD -->
<div id="hod" class="view">

<select id="subjectFilter"></select>

<div class="cards">
<div class="card"><h3>Present</h3><div class="value" id="hPresent"></div></div>
<div class="card"><h3>Total</h3><div class="value" id="hTotal"></div></div>
<div class="card"><h3>%</h3><div class="value" id="hPercent"></div></div>
</div>

<table>
<thead>
<tr><th>Subject</th><th>Attendance</th></tr>
</thead>
<tbody id="hodTable"></tbody>
</table>

</div>

<!-- PRINCIPAL -->
<div id="principal" class="view">

<h2>Departments</h2>

<div class="cards">
<div class="card">⚡ Electrical</div>
<div class="card">💻 Computer</div>
<div class="card">🏗 Civil</div>
<div class="card">⚙ Mechanical</div>
<div class="card">📡 ENTC</div>
<div class="card">🎓 First Year</div>
</div>

</div>

</div>

<script>

lucide.createIcons();

function switchView(id,el){
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 document.getElementById(id).classList.add("active");

 document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));
 el.classList.add("active");
}

let chart;

async function load(){

 const res=await fetch("/api/dashboard");
 const d=await res.json();

 let total=d.total;
 let present=d.total;
 let absent=0;

 let percent=((present/(present+absent))*100).toFixed(1);

 document.getElementById("present").innerText=present;
 document.getElementById("absent").innerText=absent;
 document.getElementById("percent").innerText=percent+"%";

 /* CHART */
 if(chart) chart.destroy();

 chart=new Chart(document.getElementById("chart"),{
  type:"bar",
  data:{
   labels:Object.keys(d.subjectWise),
   datasets:[{
    data:Object.values(d.subjectWise),
    backgroundColor:"#2563eb"
   }]
  }
 });

 /* FACULTY TABLE */
 let f="";
 Object.entries(d.studentWise).forEach(([name,count])=>{
  let p=(count/total*100).toFixed(1);
  f+=\`<tr>
  <td>\${name}</td>
  <td>-</td>
  <td>\${p}%</td>
  <td class="\${p<75?'red':'green'}">\${p<75?'Defaulter':'OK'}</td>
  </tr>\`;
 });

 facultyTable.innerHTML=f;

 /* HOD */
 let h="";
 Object.entries(d.subjectWise).forEach(([s,v])=>{
  h+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });

 hodTable.innerHTML=h;

 document.getElementById("hPresent").innerText=present;
 document.getElementById("hTotal").innerText=total;
 document.getElementById("hPercent").innerText=percent+"%";

}

load();

</script>

</body>
</html>`);
});

/* ================= START ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));
app.listen(PORT,()=>console.log("🚀 Server running"));