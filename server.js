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
const staff = loadCSV(staffPath);

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
function getData(filters, staffId){

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

 /* 🔐 SUBJECT TEACHER RESTRICTION */
 if(staffId){
  const teacherSubjects = timetable
    .filter(t=>t.staff_id===staffId)
    .map(t=>t.subject);

  records = records.filter(r=>teacherSubjects.includes(r.subject));
 }

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
  subject:req.query.subject || "",
  className:req.query.className || "",
  batch:req.query.batch || "",
  student:req.query.student || ""
 };

 const staffId=req.query.staff || "";

 const data=getData(filters,staffId);

 const subjects=[...new Set(timetable.map(t=>t.subject))];
 const classes=[...new Set(timetable.map(t=>t.class))];
 const batches=[...new Set(timetable.map(t=>t.batch))];

 res.json({...data,subjects,classes,batches});
});

/* ================= LOGIN ================= */
app.get("/",(req,res)=>{
res.send(`
<h2 style="text-align:center">Login</h2>
<input id="id" placeholder="Enter Staff ID">
<button onclick="go()">Login</button>

<script>
function go(){
 let id=document.getElementById("id").value;
 location="/subject?staff="+id;
}
</script>
`);
});

/* ================= UI ================= */
function page(title,mode){
return `
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}
.sidebar{width:220px;padding:20px;background:#020617;border-right:1px solid #334155}
.sidebar a{display:block;padding:10px;margin:5px;background:#1e293b;color:white;text-decoration:none;border-radius:6px}
.sidebar a:hover{background:#6366f1}
.main{flex:1;padding:20px}
.cards{display:flex;gap:10px}
.card{flex:1;background:#1e293b;padding:15px;border-radius:10px;text-align:center}
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

<table border="1" width="100%">
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

let chart;
const staff = new URLSearchParams(window.location.search).get("staff") || "";

async function load(){

 let url="/api?staff="+staff+
 "&subject="+subject.value+
 "&className="+className.value+
 "&batch="+batch.value+
 "&student="+(student?student.value:"");

 let d=await fetch(url).then(r=>r.json());

 /* Preserve values */
 let subVal=subject.value;
 let clsVal=className.value;
 let batVal=batch.value;

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
app.get("/subject",(req,res)=>res.send(page("Subject Teacher View","subject")));
app.get("/class",(req,res)=>res.send(page("Class Teacher View","class")));
app.get("/hod",(req,res)=>res.send(page("HOD View","hod")));

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));