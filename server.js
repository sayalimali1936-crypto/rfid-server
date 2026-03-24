const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");

/* ================= INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,"Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
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

/* ================= DATA ================= */
function getData(filters){

 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=raw.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {
   date:p[0],
   name:p[3],
   className:p[5],
   subject:p[7]
  };
 }).filter(x=>x);

 if(filters.className) records=records.filter(r=>r.className===filters.className);
 if(filters.subject) records=records.filter(r=>r.subject===filters.subject);
 if(filters.student) records=records.filter(r=>r.name.toLowerCase().includes(filters.student.toLowerCase()));

 let subjectWise={}, daily={}, studentWise={};

 records.forEach(r=>{
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  studentWise[r.name]=(studentWise[r.name]||0)+1;
  daily[r.date]=(daily[r.date]||0)+1;
 });

 let dates=Object.keys(daily).slice(-7);
 let weekly=dates.map(d=>daily[d]);

 let totalStudents=[...new Set(records.map(r=>r.name))].length || 1;
 let present=records.length;
 let absent=totalStudents-present;
 let percent=((present/totalStudents)*100).toFixed(1);

 return {
  present,absent,percent,
  subjectWise,
  weeklyLabels:dates,
  weeklyData:weekly
 };
}

/* ================= API ================= */
app.get("/api",(req,res)=>{
 const data=getData(req.query);

 const subjects=[...new Set(timetable.map(t=>t.subject))];
 const classes=["SE","TE","BE"];

 res.json({...data,subjects,classes});
});

/* ================= UI ================= */
function page(title,mode){
return `
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>

body{margin:0;font-family:Segoe UI;background:#0f172a;color:white;display:flex}

/* SIDEBAR */
.sidebar{
 width:230px;
 background:#020617;
 padding:20px;
}

.sidebar select{
 width:100%;
 padding:8px;
 margin-bottom:20px;
}

.sidebar a{
 display:block;
 padding:10px;
 margin:5px 0;
 background:#1e293b;
 border-radius:6px;
 color:white;
 text-decoration:none;
}

/* MAIN */
.main{flex:1;padding:20px}

/* CARDS */
.cards{display:flex;gap:15px}
.card{
 flex:1;
 padding:20px;
 background:#1e293b;
 border-radius:10px;
 text-align:center;
}

/* SECTION */
.section{margin-top:20px;background:#1e293b;padding:20px;border-radius:10px}

input{padding:8px;margin:5px}

</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>

<select id="className"></select>

<a href="/dashboard">Home</a>
<a href="/subject">Subject Teacher</a>
<a href="/class">Class Teacher</a>
<a href="/hod">HOD</a>
</div>

<div class="main">

<h2>${title}</h2>

<input id="student" placeholder="Search Student Name">

<div class="cards">
<div class="card">Present <h2 id="present"></h2></div>
<div class="card">Absent <h2 id="absent"></h2></div>
<div class="card">% <h2 id="percent"></h2></div>
</div>

<div class="section">
<canvas id="lineChart"></canvas>
</div>

<div class="section">
<canvas id="barChart"></canvas>
</div>

</div>

<script>

let lineChart,barChart;

async function load(){

 let cls=document.getElementById("className").value;
 let student=document.getElementById("student").value;

 let d=await fetch("/api?className="+cls+"&student="+student).then(r=>r.json());

 className.innerHTML="";
 d.classes.forEach(c=>className.innerHTML+=\`<option>\${c}</option>\`);

 present.innerText=d.present;
 absent.innerText=d.absent;
 percent.innerText=d.percent+"%";

 /* FIXED GRAPH */
 if(lineChart) lineChart.destroy();
 lineChart=new Chart(document.getElementById("lineChart"),{
  type:"line",
  data:{labels:d.weeklyLabels,datasets:[{data:d.weeklyData}]}
 });

 if(barChart) barChart.destroy();
 barChart=new Chart(document.getElementById("barChart"),{
  type:"bar",
  data:{labels:Object.keys(d.subjectWise),datasets:[{data:Object.values(d.subjectWise)}]}
 });

}

setInterval(load,3000);
load();

</script>

</body>
</html>
`;
}

/* ================= ROUTES ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));
app.get("/dashboard",(req,res)=>res.send(page("Main Dashboard","main")));
app.get("/subject",(req,res)=>res.send(page("Subject Teacher View","subject")));
app.get("/class",(req,res)=>res.send(page("Class Teacher View","class")));
app.get("/hod",(req,res)=>res.send(page("HOD Dashboard","hod")));

app.listen(PORT,()=>console.log("🚀 Running"));