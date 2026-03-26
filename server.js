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

/* ================= DATA ================= */
function getData(filters){

 const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=raw.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {
   name:p[3],
   className:p[5],
   subject:p[7]
  };
 }).filter(x=>x);

 if(filters.className) records=records.filter(r=>r.className===filters.className);
 if(filters.subject) records=records.filter(r=>r.subject===filters.subject);

 let subjectWise={}, studentSet=new Set();

 records.forEach(r=>{
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  studentSet.add(r.name);
 });

 let present=records.length;
 let totalStudents=studentSet.size || 1;
 let percent=((present/totalStudents)*100).toFixed(1);

 return {present,totalStudents,percent,subjectWise};
}

/* ================= API ================= */
app.get("/api",(req,res)=>{
 const data=getData(req.query);

 const subjects=[...new Set(timetable.map(t=>t.subject))];
 const classes=["SE","TE","BE"];

 res.json({...data,subjects,classes});
});

/* ================= UI TEMPLATE ================= */
function layout(title,content){
return `
<html>
<head>
<style>

body{
 margin:0;
 font-family:Segoe UI;
 background:linear-gradient(135deg,#020617,#0f172a);
 color:white;
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:240px;
 background:#020617;
 padding:20px;
}

.sidebar h2{margin-bottom:20px}

.sidebar a{
 display:block;
 padding:12px;
 margin:8px 0;
 background:#1e293b;
 border-radius:10px;
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
 animation:fade .5s ease;
}

@keyframes fade{
 from{opacity:0;transform:translateY(10px)}
 to{opacity:1;transform:translateY(0)}
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
 flex-wrap:wrap;
}

.card{
 flex:1;
 min-width:180px;
 padding:20px;
 border-radius:12px;
 background:#1e293b;
 text-align:center;
 transition:.3s;
}

.card:hover{
 transform:scale(1.05);
}

/* TABLE */
table{
 width:100%;
 margin-top:15px;
 border-collapse:collapse;
}
td,th{
 padding:10px;
 border-bottom:1px solid #334155;
}

select{
 padding:8px;
 margin:5px;
 border-radius:6px;
}

</style>
</head>

<body>

<div class="sidebar">
<h2>📊 System</h2>

<a href="/dashboard">Home</a>
<a href="/faculty">Faculty</a>
<a href="/hod">HOD</a>
<a href="/principal">Principal</a>

</div>

<div class="main">
<h2>${title}</h2>
${content}
</div>

</body>
</html>
`;
}

/* ================= FACULTY VIEW ================= */
app.get("/faculty",(req,res)=>{
res.send(layout("Faculty View",`

<select id="subject"></select>

<div class="cards">
<div class="card">Present <h2 id="present"></h2></div>
<div class="card">Total Students <h2 id="total"></h2></div>
<div class="card">% Attendance <h2 id="percent"></h2></div>
</div>

<table>
<tr><th>Subject</th><th>Present</th></tr>
<tbody id="table"></tbody>
</table>

<script>
async function load(){
 let d=await fetch("/api?subject="+subject.value).then(r=>r.json());

 subject.innerHTML='<option value="">Subject</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option>\${s}</option>\`);

 present.innerText=d.present;
 total.innerText=d.totalStudents;
 percent.innerText=d.percent+"%";

 table.innerHTML="";
 Object.entries(d.subjectWise).forEach(([s,v])=>{
  table.innerHTML+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });
}
load();
</script>

`));
});

/* ================= HOD VIEW ================= */
app.get("/hod",(req,res)=>{
res.send(layout("HOD View",`

<select id="className"></select>
<select id="subject"></select>

<div class="cards">
<div class="card">Present <h2 id="present"></h2></div>
<div class="card">Total Students <h2 id="total"></h2></div>
<div class="card">% Attendance <h2 id="percent"></h2></div>
</div>

<table>
<tr><th>Subject</th><th>Present</th></tr>
<tbody id="table"></tbody>
</table>

<script>
async function load(){

 let d=await fetch("/api?className="+className.value+"&subject="+subject.value).then(r=>r.json());

 className.innerHTML="";
 d.classes.forEach(c=>className.innerHTML+=\`<option>\${c}</option>\`);

 subject.innerHTML='<option value="">Subject</option>';
 d.subjects.forEach(s=>subject.innerHTML+=\`<option>\${s}</option>\`);

 present.innerText=d.present;
 total.innerText=d.totalStudents;
 percent.innerText=d.percent+"%";

 table.innerHTML="";
 Object.entries(d.subjectWise).forEach(([s,v])=>{
  table.innerHTML+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });
}
load();
</script>

`));
});

/* ================= PRINCIPAL ================= */
app.get("/principal",(req,res)=>{
res.send(layout("Principal View",`

<div class="cards">

<div class="card" onclick="go('computer')">Computer</div>
<div class="card" onclick="go('electrical')">Electrical</div>
<div class="card" onclick="go('civil')">Civil</div>
<div class="card" onclick="go('mechanical')">Mechanical</div>
<div class="card" onclick="go('entc')">ENTC</div>
<div class="card" onclick="go('firstyear')">First Year</div>

</div>

<script>
function go(dep){
 window.location="/hod?department="+dep;
}
</script>

`));
});

/* ================= HOME ================= */
app.get("/dashboard",(req,res)=>{
res.send(layout("Main Dashboard",`
<div class="cards">
<div class="card">Welcome to Smart Attendance System</div>
</div>
`));
});

/* ================= START ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));
app.listen(PORT,()=>console.log("🚀 Running"));