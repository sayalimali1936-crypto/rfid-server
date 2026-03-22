const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");

/* ================= LOAD CSV ================= */
function loadCSV(file){
 try{
  const data = fs.readFileSync(file,"utf8");
  const lines = data.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map(l=>{
   let obj={};
   l.split(",").forEach((v,i)=>obj[headers[i].trim()] = v.trim());
   return obj;
  });
 }catch(e){ return []; }
}

const students = loadCSV(studentsPath);
const timetable = loadCSV(timetablePath);

/* ================= TIME ================= */
function getNow(){
 const d = new Date(new Date().getTime()+19800000);
 return {
  day:d.toLocaleString("en-US",{weekday:"long"}),
  time:d.toTimeString().slice(0,5)
 };
}

function timeToMin(t){
 const [h,m]=t.split(":").map(Number);
 return h*60+m;
}

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const student = students.find(s=>s.card_no===card);
 if(!student) return res.send("UNKNOWN");

 const {day,time} = getNow();

 const slot = timetable.find(t=>{
  if(t.day!==day) return false;

  let start=timeToMin(t.start_time);
  let end=timeToMin(t.end_time);
  let now=timeToMin(time);

  return now>=start && now<=end &&
         t.class===student.class &&
         (t.batch==="ALL" || t.batch===student.batch);
 });

 if(!slot) return res.send("NO_SLOT");

 const csv=[
  new Date().toISOString().slice(0,10),
  time,
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
   name:p[3],
   className:p[5],
   batch:p[6],
   subject:p[7]
  };
 }).filter(x=>x && x.name && x.name!=="UNKNOWN");

 /* FILTERS */
 if(filters.subject) records=records.filter(r=>r.subject===filters.subject);
 if(filters.className) records=records.filter(r=>r.className===filters.className);
 if(filters.batch) records=records.filter(r=>r.batch===filters.batch);
 if(filters.student) records=records.filter(r=>r.name.toLowerCase().includes(filters.student.toLowerCase()));

 let student={},subjectWise={},classWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let total=records.length||1;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/total)*100;
  studentData[n]={percent:p.toFixed(1),def:p<75};
 });

 return {studentData,subjectWise,classWise,total};
}

/* ================= API ================= */
app.get("/api",(req,res)=>{

 const filters={
  subject:req.query.subject||"",
  className:req.query.className||"",
  batch:req.query.batch||"",
  student:req.query.student||""
 };

 const data=getData(filters);

 const subjects=[...new Set(timetable.map(t=>t.subject))];
 const classes=[...new Set(timetable.map(t=>t.class))];
 const batches=[...new Set(timetable.map(t=>t.batch))];

 /* LIVE SLOT */
 const {day,time} = getNow();
 const liveSlot = timetable.find(t=>{
  let now=timeToMin(time);
  return t.day===day &&
         now>=timeToMin(t.start_time) &&
         now<=timeToMin(t.end_time);
 });

 res.json({...data,subjects,classes,batches,liveSlot});
});

/* ================= UI ================= */
app.get("/",(req,res)=>{
res.send(`
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;padding:20px}
.card{background:#1e293b;padding:15px;margin:10px;border-radius:10px}
select,input{margin:5px;padding:6px}
</style>
</head>

<body>

<h2>Smart Dashboard</h2>

<div class="card" id="live"></div>

<select id="subject"></select>
<select id="className"></select>
<select id="batch"></select>
<input id="student" placeholder="Search student">
<button onclick="load()">Apply</button>

<canvas id="chart"></canvas>

<table border="1" width="100%">
<thead><tr><th>Name</th><th>%</th></tr></thead>
<tbody id="table"></tbody>
</table>

<script>

let chart;

async function load(){

 let url="/api?subject="+subject.value+
 "&className="+className.value+
 "&batch="+batch.value+
 "&student="+student.value;

 let d=await fetch(url).then(r=>r.json());

 /* LIVE */
 if(d.liveSlot){
  live.innerHTML="📘 Live: "+d.liveSlot.subject+" ("+d.liveSlot.class+")";
 }else{
  live.innerHTML="No active lecture";
 }

 /* FILTERS */
 subject.innerHTML='<option value="">Subject</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option>\${s}</option>\`);

 className.innerHTML='<option value="">Class</option>';
 d.classes.forEach(c=>className.innerHTML+=\`<option>\${c}</option>\`);

 batch.innerHTML='<option value="">Batch</option>';
 d.batches.forEach(b=>batch.innerHTML+=\`<option>\${b}</option>\`);

 /* GRAPH */
 let labels=Object.keys(d.subjectWise);
 let values=Object.values(d.subjectWise);

 if(chart) chart.destroy();
 chart=new Chart(chart,{type:"bar",data:{labels,datasets:[{data:values}]}});

 /* TABLE */
 table.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  table.innerHTML+=\`<tr><td>\${n}</td><td>\${v.percent}%</td></tr>\`;
 });
}

setInterval(load,3000);
load();

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));