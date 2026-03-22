const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");

/* ================= SAFE INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= SAFE DATA ================= */
function getData(){

 try{
  const raw = fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

  let records = raw.map(l=>{
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

  let totalLectures=records.length||1;

  let studentData={};
  Object.keys(student).forEach(n=>{
   let p=(student[n]/totalLectures)*100;
   studentData[n]={percent:p.toFixed(1),def:p<75};
  });

  return {studentData,subject,classWise,totalLectures};

 }catch(e){
  return {studentData:{},subject:{},classWise:{},totalLectures:0};
 }
}
/* =========================
   ROUTES
========================= */
app.get("/home",(req,res)=>{
  res.redirect("/");
});
app.get("/home",(req,res)=>{
  res.redirect("/");
});

app.get("/dashboard",(req,res)=>{
  res.redirect("/");
});

/* ================= API ================= */
app.get("/api",(req,res)=>{
 res.json(getData());
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
<title>Smart Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{
 margin:0;
 font-family:Segoe UI;
 display:flex;
 background:#020617;
 color:white;
}

/* SIDEBAR */
.sidebar{
 width:230px;
 background:#020617;
 padding:20px;
 border-right:1px solid #334155;
}

.sidebar button{
 width:100%;
 padding:12px;
 margin:6px 0;
 border:none;
 border-radius:8px;
 background:#1e293b;
 color:white;
 cursor:pointer;
 transition:.3s;
}

.sidebar button:hover{
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
 background:rgba(255,255,255,0.08);
 border-radius:12px;
 text-align:center;
 transition:.3s;
}

.card:hover{
 transform:scale(1.05);
}

/* GRID */
.grid{
 display:grid;
 grid-template-columns:2fr 1fr;
 gap:20px;
 margin-top:20px;
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

.def{color:#ef4444}
.ok{color:#22c55e}

/* FILTER */
select{
 padding:8px;
 margin:5px;
 border-radius:6px;
}
</style>
</head>

<body>

<div class="sidebar">
<h3>📊 Dashboard</h3>
<button onclick="load('subject')">Subject</button>
<button onclick="load('class')">Class</button>
<button onclick="load('hod')">HOD</button>
<button onclick="window.print()">Export PDF</button>
</div>

<div class="main">

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Students <h2 id="stu"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<div>
<select id="filterStudent"></select>
<button onclick="applyFilter()">Filter</button>
</div>

<div class="grid">
<canvas id="bar"></canvas>
<canvas id="pie"></canvas>
</div>

<canvas id="line" style="margin-top:20px"></canvas>

<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

let dataGlobal,charts={};

async function load(view){

 const d=await fetch("/api").then(r=>r.json());
 dataGlobal=d;

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 updateFilters();

 let labels=view==="hod"?Object.keys(d.classWise):Object.keys(d.subject);
 let values=view==="hod"?Object.values(d.classWise):Object.values(d.subject);

 drawChart("bar","bar",labels,values);
 drawChart("pie","doughnut",labels,values);
 drawChart("line","line",labels,values);

 renderTable(d.studentData);
}

function drawChart(id,type,labels,data){
 if(charts[id]) charts[id].destroy();
 charts[id]=new Chart(document.getElementById(id),{
  type:type,
  data:{labels,datasets:[{data:data}]}
 });
}

function renderTable(data){
 let t=document.getElementById("table");
 t.innerHTML="";
 Object.entries(data).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr>
    <td>\${n}</td>
    <td>\${v.percent}%</td>
    <td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });
}

function updateFilters(){
 let f=document.getElementById("filterStudent");
 f.innerHTML='<option value="">All</option>';
 Object.keys(dataGlobal.studentData).forEach(s=>{
  f.innerHTML+=\`<option>\${s}</option>\`;
 });
}

function applyFilter(){
 let val=document.getElementById("filterStudent").value;
 if(!val) return renderTable(dataGlobal.studentData);

 let obj={};
 obj[val]=dataGlobal.studentData[val];
 renderTable(obj);
}

load("subject");

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));