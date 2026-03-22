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
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

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

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const student = students.find(s=>s.card_no===card);
 if(!student) return res.send("UNKNOWN");

 const now=new Date();
 const day=now.toLocaleString("en-US",{weekday:"long"});
 const time=now.toTimeString().slice(0,5);

 const slot=timetable.find(t=>{
  return t.day===day && t.class===student.class;
 });

 if(!slot) return res.send("NO_SLOT");

 const csv=[
  now.toISOString().slice(0,10),
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
 }).filter(x=>x);

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
 const data=getData(req.query);

 const subjects=[...new Set(timetable.map(t=>t.subject))];
 const classes=[...new Set(timetable.map(t=>t.class))];
 const batches=["A","B","C"];

 res.json({...data,subjects,classes,batches});
});

/* ================= COMMON UI ================= */
function page(title,mode){
return `
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}

/* SIDEBAR */
.sidebar{
 width:220px;
 background:#020617;
 padding:20px;
 border-right:1px solid #334155;
}

.sidebar a{
 display:block;
 padding:10px;
 margin:5px;
 background:#1e293b;
 color:white;
 text-decoration:none;
 border-radius:6px;
 transition:.3s;
}
.sidebar a:hover{background:#6366f1; transform:translateX(5px)}

/* MAIN */
.main{flex:1;padding:20px}

/* CARDS */
.cards{display:flex;gap:10px}
.card{
 flex:1;
 background:#1e293b;
 padding:15px;
 border-radius:10px;
 text-align:center;
 transition:.3s;
}
.card:hover{transform:scale(1.05)}

/* GRID */
.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px}

/* FILTERS */
.filters{margin-bottom:10px}
select,input{padding:6px;margin:5px;border-radius:5px}

/* TABLE */
table{width:100%;margin-top:20px;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>
<a href="/subject">📘 Subject</a>
<a href="/class">👩‍🏫 Class</a>
<a href="/hod">🏫 HOD</a>
</div>

<div class="main">

<h2>${title}</h2>

<div class="filters">
<select id="subject"></select>
<select id="class"></select>
<select id="batch"></select>
${mode==="class" ? '<input id="student" placeholder="Search Student">' : ''}
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

let chart;

async function load(){

 let url="/api?subject="+subject.value+
 "&class="+class.value+
 "&batch="+batch.value+
 "&student="+(student?student.value:"");

 let d=await fetch(url).then(r=>r.json());

 lec.innerText=d.total;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 subject.innerHTML='<option value="">Subject</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option>\${s}</option>\`);

 class.innerHTML='<option value="">Class</option>';
 d.classes.forEach(c=>class.innerHTML+=\`<option>\${c}</option>\`);

 batch.innerHTML='<option value="">Batch</option>';
 d.batches.forEach(b=>batch.innerHTML+=\`<option>\${b}</option>\`);

 let labels="${mode}"==="hod"?Object.keys(d.classWise):Object.keys(d.subjectWise);
 let values="${mode}"==="hod"?Object.values(d.classWise):Object.values(d.subjectWise);

 if(chart) chart.destroy();
 chart=new Chart(bar,{type:"bar",data:{labels,datasets:[{data:values}]}});

 table.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  table.innerHTML+=\`<tr>
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
`;
}

/* ================= ROUTES ================= */
app.get("/",(req,res)=>res.redirect("/subject"));
app.get("/subject",(req,res)=>res.send(page("Subject Teacher View","subject")));
app.get("/class",(req,res)=>res.send(page("Class Teacher View","class")));
app.get("/hod",(req,res)=>res.send(page("HOD View","hod")));

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));