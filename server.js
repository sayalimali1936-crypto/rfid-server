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

 let subjectWise={},studentWise={};

 records.forEach(r=>{
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  studentWise[r.name]=(studentWise[r.name]||0)+1;
 });

 let totalStudents=[...new Set(records.map(r=>r.name))].length||1;

 return {
  subjectWise,
  studentWise,
  totalStudents,
  total:records.length
 };
}

/* ================= API ================= */
app.get("/api",(req,res)=>{
 const data=getData(req.query);

 const subjects=[...new Set(timetable.map(t=>t.subject))];
 const classes=["SE","TE","BE"];

 res.json({...data,subjects,classes});
});

/* ================= UI TEMPLATE ================= */
function layout(title,mode){
return `
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{margin:0;font-family:Segoe UI;background:#0f172a;color:white;display:flex}
.sidebar{width:220px;background:#020617;padding:20px}
.sidebar a{display:block;padding:10px;margin:5px;background:#1e293b;color:white;text-decoration:none;border-radius:6px}
.main{flex:1;padding:20px}
.card{background:#1e293b;padding:20px;border-radius:10px;margin:10px 0}
</style>
</head>

<body>

<div class="sidebar">
<h3>Dashboard</h3>
<a href="/faculty">Faculty</a>
<a href="/hod">HOD</a>
<a href="/principal">Principal</a>
</div>

<div class="main">

<h2>${title}</h2>

${mode==="faculty" ? `
<select id="subject"></select>
<button onclick="load()">Apply</button>
` : ""}

${mode==="hod" ? `
<select id="className"></select>
<select id="subject"></select>
<button onclick="load()">Apply</button>
` : ""}

<div class="card">
<h3>Attendance</h3>
<p id="summary"></p>
</div>

<canvas id="chart"></canvas>

</div>

<script>

let chart;

async function load(){

 let url="/api";

 ${mode==="faculty" ? `url+="?subject="+subject.value;` : ""}
 ${mode==="hod" ? `url+="?className="+className.value+"&subject="+subject.value;` : ""}

 let d=await fetch(url).then(r=>r.json());

 summary.innerText=d.total+" / "+d.totalStudents+
 " ("+((d.total/d.totalStudents)*100).toFixed(1)+"%)";

 if(chart) chart.destroy();
 chart=new Chart(document.getElementById("chart"),{
  type:"bar",
  data:{
   labels:Object.keys(d.subjectWise),
   datasets:[{data:Object.values(d.subjectWise)}]
  }
 });

 if(subject){
 subject.innerHTML="";
 d.subjects.forEach(s=>subject.innerHTML+=\`<option>\${s}</option>\`);
 }

 if(className){
 className.innerHTML="";
 d.classes.forEach(c=>className.innerHTML+=\`<option>\${c}</option>\`);
 }

}

load();

</script>

</body>
</html>
`;
}

/* ================= PRINCIPAL PAGE ================= */
app.get("/principal",(req,res)=>{
res.send(`
<h2>Select Department</h2>
<a href="/hod?dept=computer">Computer</a><br>
<a href="/hod?dept=electrical">Electrical</a><br>
<a href="/hod?dept=civil">Civil</a><br>
<a href="/hod?dept=mechanical">Mechanical</a><br>
<a href="/hod?dept=entc">ENTC</a><br>
<a href="/hod?dept=fy">First Year</a>
`);
});

/* ================= ROUTES ================= */
app.get("/",(req,res)=>res.redirect("/principal"));
app.get("/faculty",(req,res)=>res.send(layout("Faculty Dashboard","faculty")));
app.get("/hod",(req,res)=>res.send(layout("HOD Dashboard","hod")));

app.listen(PORT,()=>console.log("🚀 Final System Running"));