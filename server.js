const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");

/* ================= INIT ================= */
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,"Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= ROOT ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const now=new Date();

 const csv=[
  now.toISOString().slice(0,10),
  now.toTimeString().slice(0,5),
  "STUDENT",
  "Unknown",
  card,
  "SE",
  "A",
  "Subject"
 ].join(",")+"\n";

 fs.appendFileSync(csvPath,csv);
 res.send("OK");
});

/* ================= ANALYTICS ================= */
app.get("/api/analytics",(req,res)=>{

 const raw = fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records = raw.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {
    date:p[0],
    name:p[3],
    className:p[5],
    subject:p[7]
  };
 }).filter(x=>x && x.name);

 let lectureSet=new Set();
 records.forEach(r=>lectureSet.add(r.subject+"_"+r.date));

 let subjectLectures={};
 lectureSet.forEach(k=>{
  let s=k.split("_")[0];
  subjectLectures[s]=(subjectLectures[s]||0)+1;
 });

 let studentMap={};
 records.forEach(r=>{
  if(!studentMap[r.name]) studentMap[r.name]={};
  studentMap[r.name][r.subject]=(studentMap[r.name][r.subject]||0)+1;
 });

 let report={}, defaulters=[];

 Object.keys(studentMap).forEach(name=>{
  report[name]=[];

  Object.keys(studentMap[name]).forEach(sub=>{
    let attended=studentMap[name][sub];
    let total=subjectLectures[sub]||1;
    let percent=(attended/total)*100;

    if(percent<75) defaulters.push(name);

    report[name].push({
      subject:sub,
      percent:percent.toFixed(1),
      defaulter:percent<75
    });
  });
 });

 res.json({
  report,
  subjectLectures,
  totalStudents:Object.keys(studentMap).length,
  defaulters:[...new Set(defaulters)]
 });

});

/* ================= DASHBOARD ================= */
app.get("/dashboard",(req,res)=>{
res.send(`<!DOCTYPE html>
<html>
<head>
<title>Attendance SaaS</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{
 margin:0;
 font-family:Segoe UI;
 background:linear-gradient(135deg,#020617,#0f172a);
 color:#e2e8f0;
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:250px;
 background:#020617;
 padding:20px;
 border-right:1px solid #1e293b;
}

.nav{
 padding:12px;
 margin:8px 0;
 border-radius:8px;
 background:#1e293b;
 cursor:pointer;
 transition:.3s;
}
.nav:hover{background:#2563eb; transform:translateX(5px)}
.active{background:#2563eb}

/* MAIN */
.main{
 flex:1;
 padding:25px;
 animation:fade .5s ease;
}

@keyframes fade{
 from{opacity:0; transform:translateY(10px)}
 to{opacity:1}
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
 margin-bottom:20px;
}

.card{
 flex:1;
 background:rgba(255,255,255,0.05);
 padding:20px;
 border-radius:12px;
 backdrop-filter:blur(10px);
 transition:.3s;
}
.card:hover{transform:translateY(-5px)}

.value{font-size:26px}

/* TABLE */
table{
 width:100%;
 border-collapse:collapse;
 margin-top:20px;
}
td,th{
 padding:10px;
 border-bottom:1px solid #334155;
}
tr:hover{background:#1e293b}

.red{color:#ef4444}
.green{color:#22c55e}

/* VIEW */
.view{display:none}
.view.active{display:block}

input{
 padding:8px;
 margin-bottom:10px;
 border-radius:6px;
}
</style>
</head>

<body>

<div class="sidebar">
<div class="nav active" onclick="show('dashboard',this)">📊 Dashboard</div>
<div class="nav" onclick="show('faculty',this)">👨‍🏫 Faculty</div>
<div class="nav" onclick="show('hod',this)">🏫 HOD</div>
</div>

<div class="main">

<!-- DASHBOARD -->
<div id="dashboard" class="view active">

<div class="cards">
<div class="card">Students<div class="value" id="students"></div></div>
<div class="card">Defaulters<div class="value" id="def"></div></div>
</div>

<canvas id="chart"></canvas>

</div>

<!-- FACULTY -->
<div id="faculty" class="view">

<input id="search" placeholder="Search student">

<table>
<tr><th>Name</th><th>Subject</th><th>%</th><th>Status</th></tr>
<tbody id="fTable"></tbody>
</table>

</div>

<!-- HOD -->
<div id="hod" class="view">

<table>
<tr><th>Subject</th><th>Lectures</th></tr>
<tbody id="hTable"></tbody>
</table>

</div>

</div>

<script>

function show(id,el){
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 document.getElementById(id).classList.add("active");

 document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));
 el.classList.add("active");
}

let chart,globalData;

async function load(){

 const res=await fetch("/api/analytics");
 const d=await res.json();
 globalData=d;

 students.innerText=d.totalStudents;
 def.innerText=d.defaulters.length;

 if(chart) chart.destroy();

 chart=new Chart(document.getElementById("chart"),{
  type:"bar",
  data:{
   labels:Object.keys(d.subjectLectures),
   datasets:[{
    data:Object.values(d.subjectLectures),
    backgroundColor:"#2563eb"
   }]
  }
 });

 renderTable(d.report);
 renderHOD(d.subjectLectures);
}

function renderTable(report){
 let f="";
 Object.entries(report).forEach(([name,list])=>{
  list.forEach(s=>{
    f+=\`<tr>
    <td>\${name}</td>
    <td>\${s.subject}</td>
    <td>\${s.percent}%</td>
    <td class="\${s.defaulter?'red':'green'}">
    \${s.defaulter?'Defaulter':'OK'}
    </td>
    </tr>\`;
  });
 });
 fTable.innerHTML=f;
}

function renderHOD(data){
 let h="";
 Object.entries(data).forEach(([s,v])=>{
  h+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });
 hTable.innerHTML=h;
}

/* SEARCH */
search.addEventListener("input",()=>{
 let val=search.value.toLowerCase();

 let filtered={};

 Object.keys(globalData.report).forEach(name=>{
  if(name.toLowerCase().includes(val)){
    filtered[name]=globalData.report[name];
  }
 });

 renderTable(filtered);
});

/* AUTO REFRESH */
setInterval(load,5000);
load();

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.get("/", (req,res)=> res.redirect("/dashboard"));
app.listen(PORT,()=>console.log("🚀 SaaS Attendance Running on "+PORT));