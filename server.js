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
  const data=fs.readFileSync(file,"utf8");
  const lines=data.trim().split(/\r?\n/);
  const headers=lines.shift().split(",");
  return lines.map(l=>{
   let obj={};
   l.split(",").forEach((v,i)=>obj[headers[i]]=v);
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
   name:p[3],
   className:p[5],
   batch:p[6],
   subject:p[7]
  };
 }).filter(x=>x && x.name && x.name!=="UNKNOWN");

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

 res.json({...data,subjects,classes,batches});
});

/* ================= UI ================= */
function page(title,mode){
return `
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{
 margin:0;
 font-family:Segoe UI;
 background:#020617;
 color:white;
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:220px;
 padding:20px;
 background:#020617;
 border-right:1px solid #334155;
}

.sidebar a{
 display:block;
 padding:10px;
 margin:5px;
 border-radius:8px;
 background:#1e293b;
 color:white;
 text-decoration:none;
 transition:.3s;
}
.sidebar a:hover{
 background:#6366f1;
 transform:translateX(5px);
}

/* MAIN */
.main{
 flex:1;
 padding:20px;
 animation:fadeIn .5s ease;
}

@keyframes fadeIn{
 from{opacity:0; transform:translateY(10px)}
 to{opacity:1; transform:translateY(0)}
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
}

.card{
 flex:1;
 padding:20px;
 border-radius:12px;
 background:linear-gradient(135deg,#6366f1,#22c55e);
 text-align:center;
 transition:.3s;
}
.card:hover{
 transform:scale(1.05);
}

/* FILTERS */
select,input{
 padding:8px;
 margin:5px;
 border-radius:6px;
}

/* TABLE */
table{
 width:100%;
 margin-top:20px;
 border-collapse:collapse;
}
td,th{
 padding:10px;
 border-bottom:1px solid #334155;
}
</style>
</head>

<body>

<div class="sidebar">
<a href="/subject">Subject</a>
<a href="/class">Class</a>
<a href="/hod">HOD</a>
</div>

<div class="main">

<h2>${title}</h2>

<select id="subject"></select>
<select id="className"></select>
<select id="batch"></select>
${mode==="class" ? '<input id="student" placeholder="Search Student">' : ''}
<button onclick="load()">Apply</button>

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Students <h2 id="stu"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<canvas id="bar"></canvas>

<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

let chart;

async function load(){

 const subVal=subject.value;
 const clsVal=className.value;
 const batVal=batch.value;
 const stuVal=student?student.value:"";

 let url="/api?subject="+subVal+"&className="+clsVal+"&batch="+batVal+"&student="+stuVal;

 let d=await fetch(url).then(r=>r.json());

 /* PRESERVE FILTERS */
 subject.innerHTML='<option value="">Subject</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option \${s===subVal?'selected':''}>\${s}</option>\`);

 className.innerHTML='<option value="">Class</option>';
 d.classes.forEach(c=>className.innerHTML+=\`<option \${c===clsVal?'selected':''}>\${c}</option>\`);

 batch.innerHTML='<option value="">Batch</option>';
 d.batches.forEach(b=>batch.innerHTML+=\`<option \${b===batVal?'selected':''}>\${b}</option>\`);

 lec.innerText=d.total;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

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