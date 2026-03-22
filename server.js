const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");

/* ================= INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= LOAD TIMETABLE ================= */
function loadTimetable(){
 try{
  const data = fs.readFileSync(timetablePath,"utf8");
  const lines = data.split(/\r?\n/).slice(1);

  let subjects=new Set();
  let classes=new Set();
  let batches=new Set();

  lines.forEach(l=>{
    let p=l.split(",");
    if(p.length<5) return;

    subjects.add(p[4]);   // subject column
    classes.add(p[1]);    // class column
    batches.add(p[2]);    // batch column
  });

  return {
    subjects:[...subjects],
    classes:[...classes],
    batches:[...batches]
  };

 }catch(e){
  return {subjects:[],classes:[],batches:[]};
 }
}

/* ================= DATA ================= */
function getData(filters){

 try{
  const raw = fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

  let records = raw.map(l=>{
    let p=l.split(",");
    if(p.length<8) return null;

    return {
      date:p[0],
      role:p[2],
      name:p[3],
      className:p[5],
      batch:p[6],
      subject:p[7]
    };
  }).filter(x=>x && x.role==="STUDENT" && x.name!=="UNKNOWN");

  /* APPLY FILTERS */
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

  let totalLectures = records.length || 1;

  let studentData={};
  Object.keys(student).forEach(n=>{
    let p=(student[n]/totalLectures)*100;
    studentData[n]={percent:p.toFixed(1),def:p<75};
  });

  return {studentData,subjectWise,classWise,totalLectures};

 }catch(e){
  return {studentData:{},subjectWise:{},classWise:{},totalLectures:0};
 }
}

/* ================= API ================= */
app.get("/api",(req,res)=>{
 const filters={
  subject:req.query.subject||"",
  className:req.query.class||"",
  batch:req.query.batch||"",
  student:req.query.student||""
 };

 const data=getData(filters);
 const meta=loadTimetable();

 res.json({...data,...meta});
});

/* ================= LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const date=new Date().toISOString().slice(0,10);
 const csv=[date,"--","STUDENT","UNKNOWN",card,"--","--","--"].join(",")+"\n";

 fs.appendFileSync(csvPath,csv);
 res.send("OK");
});

/* ================= UI ================= */
app.get("/",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}
.sidebar{width:230px;padding:20px;background:#020617;border-right:1px solid #334155}
.sidebar button{width:100%;padding:10px;margin:5px;background:#1e293b;color:white;border:none;border-radius:6px}
.main{flex:1;padding:20px}
.cards{display:flex;gap:10px}
.card{flex:1;padding:15px;background:#1e293b;border-radius:8px;text-align:center}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px}
select,input{padding:6px;margin:5px;border-radius:5px}
</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>
<button onclick="view='subject';load()">Subject</button>
<button onclick="view='class';load()">Class</button>
<button onclick="view='hod';load()">HOD</button>
</div>

<div class="main">

<div>
<select id="subject"></select>
<select id="class"></select>
<select id="batch"></select>
<input id="student" placeholder="Search student"/>
<button onclick="load()">Apply</button>
</div>

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Students <h2 id="stu"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<div class="grid">
<canvas id="bar"></canvas>
<canvas id="pie"></canvas>
</div>

<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

let view="subject",chart;

async function load(){

 let url="/api?subject="+subject.value+
 "&class="+class.value+
 "&batch="+batch.value+
 "&student="+student.value;

 let d=await fetch(url).then(r=>r.json());

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 /* Fill filters */
 subject.innerHTML='<option value="">All Subjects</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option>\${s}</option>\`);

 class.innerHTML='<option value="">All Class</option>';
 d.classes.forEach(c=>class.innerHTML+=\`<option>\${c}</option>\`);

 batch.innerHTML='<option value="">All Batch</option>';
 d.batches.forEach(b=>batch.innerHTML+=\`<option>\${b}</option>\`);

 let labels=view==="hod"?Object.keys(d.classWise):Object.keys(d.subjectWise);
 let values=view==="hod"?Object.values(d.classWise):Object.values(d.subjectWise);

 if(chart) chart.destroy();
 chart=new Chart(bar,{type:"bar",data:{labels,datasets:[{data:values}]}});

 let t=table;
 t.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`<tr>
  <td>\${n}</td>
  <td>\${v.percent}%</td>
  <td style="color:\${v.def?'red':'lime'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });
}

load();

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));