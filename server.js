const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");

/* ================= INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= TEST DATA (IMPORTANT) ================= */
if (fs.readFileSync(csvPath,"utf8").split("\n").length < 3){
 fs.appendFileSync(csvPath,
`2026-03-22,10:00,STUDENT,Alice,1,SE,A,Math
2026-03-22,10:05,STUDENT,Bob,2,SE,B,Math
2026-03-22,11:00,STUDENT,Alice,1,SE,A,Physics
2026-03-22,11:05,STUDENT,Bob,2,SE,B,Physics
`);
}

/* ================= RFID ================= */
app.get("/log",(req,res)=>{
 res.send("OK");
});

/* ================= DATA ================= */
function getData(){

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
 }).filter(x=>x && x.name && x.name!=="UNKNOWN");

 let student={},subject={},classWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subject[r.subject]=(subject[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length||1;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/totalLectures)*100;
  studentData[n]={percent:p.toFixed(1),def:p<75};
 });

 return {studentData,subject,classWise,totalLectures};
}

/* ================= API ================= */
app.get("/api",(req,res)=>{
 res.json(getData());
});

/* ================= DASHBOARD ================= */
app.get("/",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{background:#0f172a;color:white;font-family:Segoe UI}
button{margin:5px;padding:10px}
</style>

</head>

<body>

<h1>Dashboard</h1>

<button onclick="load('subject')">Subject</button>
<button onclick="load('class')">Class</button>
<button onclick="load('hod')">HOD</button>

<h3>Lectures: <span id="lec"></span></h3>

<canvas id="bar"></canvas>

<table border="1">
<tr><th>Name</th><th>%</th></tr>
<tbody id="table"></tbody>
</table>

<script>

let chart;

async function load(view){

 let d=await fetch("/api").then(r=>r.json());

 document.getElementById("lec").innerText=d.totalLectures;

 let labels=view==="hod"?Object.keys(d.classWise):Object.keys(d.subject);
 let values=view==="hod"?Object.values(d.classWise):Object.values(d.subject);

 if(labels.length===0){
  labels=["No Data"];
  values=[1];
 }

 if(chart) chart.destroy();

 chart=new Chart(document.getElementById("bar"),{
  type:"bar",
  data:{labels:labels,datasets:[{data:values}]}
 });

 let t=document.getElementById("table");
 t.innerHTML="";

 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr><td>\${n}</td><td>\${v.percent}%</td></tr>\`;
 });
}

load("subject");

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("Server running"));