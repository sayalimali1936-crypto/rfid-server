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
   batch:p[6],
   subject:p[7]
  };
 }).filter(x=>x && x.name && x.name!=="UNKNOWN");

 /* FILTERS */
 if(filters.subject) records=records.filter(r=>r.subject===filters.subject);
 if(filters.className) records=records.filter(r=>r.className===filters.className);
 if(filters.batch) records=records.filter(r=>r.batch===filters.batch);
 if(filters.student) records=records.filter(r=>r.name.toLowerCase().includes(filters.student.toLowerCase()));

 let student={},subjectWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length || 1;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/totalLectures)*100;
  studentData[n]={percent:p.toFixed(1),def:p<75};
 });

 /* TODAY */
 let today=new Date().toISOString().slice(0,10);
 let todayCount=records.filter(r=>r.date===today).length;
 let totalStudents=Object.keys(student).length || 1;
 let todayPercent=((todayCount/totalStudents)*100).toFixed(1);

 /* BEST & LOWEST SUBJECT */
 let bestSubject="",lowSubject="";
 let max=0,min=9999;

 Object.entries(subjectWise).forEach(([s,v])=>{
  if(v>max){max=v;bestSubject=s;}
  if(v<min){min=v;lowSubject=s;}
 });

 return {
  studentData,
  totalLectures,
  todayCount,
  todayPercent,
  totalStudents,
  defaulters:Object.values(studentData).filter(x=>x.def).length,
  bestSubject,
  lowSubject
 };
}

/* ================= API ================= */
app.get("/api",(req,res)=>{

 const filters={
  subject:req.query.subject || "",
  className:req.query.className || "",
  batch:req.query.batch || "",
  student:req.query.student || ""
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
<html>
<head>
<style>
body{margin:0;font-family:Segoe UI;background:linear-gradient(135deg,#020617,#0f172a);color:white;display:flex}

/* sidebar */
.sidebar{width:220px;padding:20px;background:#020617;border-right:1px solid #334155}
.sidebar a{display:block;padding:10px;margin:5px;background:#1e293b;color:white;text-decoration:none;border-radius:6px}
.sidebar a:hover{background:#6366f1}

/* main */
.main{flex:1;padding:20px}

/* cards */
.cards{display:flex;gap:15px;flex-wrap:wrap}
.card{
 flex:1;
 min-width:180px;
 padding:20px;
 border-radius:12px;
 background:rgba(255,255,255,0.08);
 backdrop-filter:blur(10px);
 text-align:center;
}

/* filters */
select,input{padding:8px;margin:5px;border-radius:6px}

/* table */
table{width:100%;margin-top:20px;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>
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
<button onclick="apply()">Apply</button>

<div class="cards">
<div class="card">📚 Lectures<br><h2 id="lec"></h2></div>
<div class="card">👥 Today<br><h2 id="today"></h2></div>
<div class="card">📊 Today %<br><h2 id="todayP"></h2></div>
<div class="card">⚠ Defaulters<br><h2 id="def"></h2></div>
<div class="card">🎓 Students<br><h2 id="stu"></h2></div>
</div>

<div class="cards" style="margin-top:20px">
<div class="card">🏆 Best Subject<br><h3 id="best"></h3></div>
<div class="card">📉 Lowest Subject<br><h3 id="low"></h3></div>
</div>

<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

let filters={subject:"",className:"",batch:"",student:""};

function apply(){
 filters.subject=subject.value;
 filters.className=className.value;
 filters.batch=batch.value;
 filters.student=student?student.value:"";
 load();
}

async function load(){

 let d=await fetch("/api?subject="+filters.subject+
 "&className="+filters.className+
 "&batch="+filters.batch+
 "&student="+filters.student).then(r=>r.json());

 subject.innerHTML='<option value="">Subject</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option \${s===filters.subject?'selected':''}>\${s}</option>\`);

 className.innerHTML='<option value="">Class</option>';
 d.classes.forEach(c=>className.innerHTML+=\`<option \${c===filters.className?'selected':''}>\${c}</option>\`);

 batch.innerHTML='<option value="">Batch</option>';
 d.batches.forEach(b=>batch.innerHTML+=\`<option \${b===filters.batch?'selected':''}>\${b}</option>\`);

 lec.innerText=d.totalLectures;
 today.innerText=d.todayCount;
 todayP.innerText=d.todayPercent+"%";
 def.innerText=d.defaulters;
 stu.innerText=d.totalStudents;

 best.innerText=d.bestSubject || "-";
 low.innerText=d.lowSubject || "-";

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