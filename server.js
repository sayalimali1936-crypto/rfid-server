const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");
const staffPath = path.join(__dirname, "Staff_Master.csv");

/* ================= LOAD CSV ================= */
function loadCSV(file){
 try{
  const data=fs.readFileSync(file,"utf8");
  const lines=data.split(/\r?\n/);
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
const staff = loadCSV(staffPath);

/* ================= LOGIN ================= */
app.get("/",(req,res)=>{
res.send(`
<h2 style="text-align:center">Teacher Login</h2>
<input id="id" placeholder="Enter Staff ID">
<button onclick="login()">Login</button>

<script>
function login(){
 let id=document.getElementById("id").value;
 location="/dashboard?staff="+id;
}
</script>
`);
});

/* ================= DASHBOARD ================= */
app.get("/dashboard",(req,res)=>{

const staffId = req.query.staff;

/* detect teacher subject */
const teacherSlots = timetable.filter(t=>t.staff_id===staffId);
const subjects = [...new Set(teacherSlots.map(t=>t.subject))];
const classes = [...new Set(teacherSlots.map(t=>t.class))];

res.send(`
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}

/* sidebar */
.sidebar{
 width:220px;
 padding:20px;
 background:#020617;
 border-right:1px solid #334155;
}

.main{flex:1;padding:20px}

.card{
 background:#1e293b;
 padding:15px;
 border-radius:10px;
 margin:10px;
}

/* alert */
.alert{
 background:#ef4444;
 padding:10px;
 border-radius:8px;
 margin-top:10px;
}
</style>
</head>

<body>

<div class="sidebar">
<h3>Teacher Panel</h3>
<p>ID: ${staffId}</p>
<p>Subjects: ${subjects.join(", ")}</p>
</div>

<div class="main">

<h2>📘 Subject Teacher Dashboard</h2>

<div class="card">
<b>Classes:</b> ${classes.join(", ")}
</div>

<div class="card">
<b>Subjects:</b> ${subjects.join(", ")}
</div>

<div class="card">
<b>Lecture Stats</b>
<p id="stats"></p>
</div>

<div class="card">
<canvas id="chart"></canvas>
</div>

<div class="card">
<h3>Students</h3>
<table border="1" width="100%">
<thead><tr><th>Name</th><th>%</th><th>Status</th></tr></thead>
<tbody id="table"></tbody>
</table>
</div>

<div id="alertBox"></div>

</div>

<script>

async function load(){

 let res = await fetch("/api?staff=${staffId}");
 let d = await res.json();

 let labels=Object.keys(d.subjectWise);
 let values=Object.values(d.subjectWise);

 new Chart(chart,{type:"bar",data:{labels,datasets:[{data:values}]}});

 let t=table;
 t.innerHTML="";

 let defaulters=0;

 Object.entries(d.studentData).forEach(([n,v])=>{
  if(v.def) defaulters++;

  t.innerHTML+=\`
  <tr>
    <td>\${n}</td>
    <td>\${v.percent}%</td>
    <td style="color:\${v.def?'red':'lime'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });

 stats.innerText =
 "Conducted: "+d.conducted+
 " | Expected: "+d.expected+
 " | %: "+d.lecturePercent+"%";

 if(defaulters>0){
  alertBox.innerHTML =
  "<div class='alert'>⚠ "+defaulters+" Defaulters detected</div>";
 }

}

load();

</script>

</body>
</html>
`);
});

/* ================= API ================= */
app.get("/api",(req,res)=>{

 const staffId = req.query.staff;

 const teacherSlots = timetable.filter(t=>t.staff_id===staffId);

 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=raw.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {
    name:p[3],
    subject:p[7]
  };
 }).filter(x=>x && x.name);

 /* filter by teacher subjects */
 records = records.filter(r=>teacherSlots.some(t=>t.subject===r.subject));

 let student={},subjectWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
 });

 let total=records.length||1;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/total)*100;
  studentData[n]={percent:p.toFixed(1),def:p<75};
 });

 /* lecture stats */
 const expected = teacherSlots.length * 5; // weekly approx
 const conducted = total;
 const lecturePercent = ((conducted/expected)*100).toFixed(1);

 res.json({
  studentData,
  subjectWise,
  conducted,
  expected,
  lecturePercent
 });
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));