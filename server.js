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
<title>Advanced Attendance System</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#0f172a;color:white;display:flex}

/* sidebar */
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

.nav:hover{background:#6366f1}
.active{background:#6366f1}

/* main */
.main{flex:1;padding:20px}

/* cards */
.cards{display:flex;gap:15px;margin-bottom:20px}
.card{flex:1;padding:20px;background:#1e293b;border-radius:10px;text-align:center}
.big{font-size:24px}

/* table */
table{width:100%;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
.red{color:#ef4444}
.green{color:#22c55e}

.view{display:none}
.view.active{display:block}
</style>
</head>

<body>

<div class="sidebar">
<h3>📊 System</h3>
<div class="nav active" onclick="show('home',this)">Dashboard</div>
<div class="nav" onclick="show('faculty',this)">Faculty</div>
<div class="nav" onclick="show('hod',this)">HOD</div>
</div>

<div class="main">

<!-- HOME -->
<div id="home" class="view active">
<div class="cards">
<div class="card">Subjects<div class="big" id="subjects"></div></div>
<div class="card">Students<div class="big" id="students"></div></div>
<div class="card">Defaulters<div class="big" id="def"></div></div>
</div>

<canvas id="chart"></canvas>
</div>

<!-- FACULTY -->
<div id="faculty" class="view">
<h3>Student Report</h3>
<table>
<thead>
<tr><th>Name</th><th>Subject</th><th>%</th><th>Status</th></tr>
</thead>
<tbody id="fTable"></tbody>
</table>
</div>

<!-- HOD -->
<div id="hod" class="view">
<h3>Subject Summary</h3>
<table>
<thead><tr><th>Subject</th><th>Lectures</th></tr></thead>
<tbody id="hTable"></tbody>
</table>
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

 const res=await fetch("/api/advanced");
 const d=await res.json();

 let students=Object.keys(d.report).length;
 let subjects=Object.keys(d.subjectLectures).length;

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

 document.getElementById("students").innerText=students;
 document.getElementById("subjects").innerText=subjects;
 document.getElementById("def").innerText=def;

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
     backgroundColor:"#6366f1"
   }]
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