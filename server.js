// ================== IMPORT ==================
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");

// ================== INIT ==================
if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,"Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

// ================== ROOT ==================
app.get("/",(req,res)=>res.redirect("/dashboard"));

// ================== CORE ANALYTICS ==================
app.get("/api/analytics",(req,res)=>{

 const raw = fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records = raw.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {
    date:p[0],
    name:p[3],
    className:p[5],
    batch:p[6],
    subject:p[7]
  };
 }).filter(x=>x && x.name);

 // -------- lectures ----------
 let lectureSet=new Set();
 records.forEach(r=>lectureSet.add(r.subject+"_"+r.date));

 let subjectLectures={};
 lectureSet.forEach(k=>{
  let s=k.split("_")[0];
  subjectLectures[s]=(subjectLectures[s]||0)+1;
 });

 // -------- student ----------
 let studentMap={};
 records.forEach(r=>{
  if(!studentMap[r.name]) studentMap[r.name]={};
  studentMap[r.name][r.subject]=(studentMap[r.name][r.subject]||0)+1;
 });

 let report={};
 let defaulters=0;

 Object.keys(studentMap).forEach(name=>{
  report[name]=[];

  Object.keys(studentMap[name]).forEach(sub=>{
    let attended=studentMap[name][sub];
    let total=subjectLectures[sub]||1;
    let percent=(attended/total)*100;

    if(percent<75) defaulters++;

    report[name].push({
      subject:sub,
      attended,
      total,
      percent:percent.toFixed(1),
      defaulter:percent<75
    });
  });
 });

 let totalStudents = Object.keys(studentMap).length;

 res.json({
  report,
  subjectLectures,
  totalStudents,
  defaulters
 });

});

// ================== DASHBOARD ==================
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Enterprise Dashboard</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>

:root{
 --bg:#0f172a;
 --card:rgba(255,255,255,0.05);
 --accent:#3b82f6;
 --text:#e2e8f0;
}

body{
 margin:0;
 font-family:Segoe UI;
 background:linear-gradient(135deg,#020617,#0f172a);
 color:var(--text);
 display:flex;
}

/* SIDEBAR */
.sidebar{
 width:240px;
 padding:20px;
 background:#020617;
 border-right:1px solid #1e293b;
}

.nav{
 padding:12px;
 margin:8px 0;
 border-radius:8px;
 cursor:pointer;
 transition:.3s;
 background:#1e293b;
}

.nav:hover{
 transform:translateX(5px);
 background:var(--accent);
}

.active{background:var(--accent)}

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
 gap:20px;
 margin-bottom:20px;
}

.card{
 flex:1;
 padding:20px;
 border-radius:14px;
 background:var(--card);
 backdrop-filter:blur(10px);
 transition:.3s;
}

.card:hover{
 transform:translateY(-8px);
 box-shadow:0 10px 25px rgba(0,0,0,0.4);
}

.card h3{
 font-size:13px;
 color:#94a3b8;
 margin:0;
}

.value{
 font-size:28px;
 margin-top:8px;
}

/* CHART */
.chart-box{
 background:var(--card);
 padding:20px;
 border-radius:14px;
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
 border-bottom:1px solid #1e293b;
}

tr:hover{
 background:rgba(59,130,246,0.1);
}

.red{color:#ef4444}
.green{color:#22c55e}

/* VIEW */
.view{display:none}
.view.active{display:block}

</style>
</head>

<body>

<div class="sidebar">
<div class="nav active" onclick="show('home',this)">📊 Dashboard</div>
<div class="nav" onclick="show('faculty',this)">👨‍🏫 Faculty</div>
<div class="nav" onclick="show('hod',this)">🏫 HOD</div>
</div>

<div class="main">

<!-- DASHBOARD -->
<div id="home" class="view active">

<div class="cards">
<div class="card"><h3>Total Students</h3><div class="value" id="students"></div></div>
<div class="card"><h3>Defaulters</h3><div class="value" id="def"></div></div>
</div>

<div class="chart-box">
<canvas id="barChart"></canvas>
</div>

<div class="chart-box">
<canvas id="lineChart"></canvas>
</div>

</div>

<!-- FACULTY -->
<div id="faculty" class="view">

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

let barChart,lineChart;

async function load(){

 const res=await fetch("/api/analytics");
 const d=await res.json();

 students.innerText=d.totalStudents;
 def.innerText=d.defaulters;

 /* BAR CHART */
 if(barChart) barChart.destroy();

 barChart=new Chart(document.getElementById("barChart"),{
  type:"bar",
  data:{
   labels:Object.keys(d.subjectLectures),
   datasets:[{
    data:Object.values(d.subjectLectures),
    backgroundColor:"#3b82f6"
   }]
  },
  options:{
   animation:{duration:1200},
   plugins:{legend:{display:false}}
  }
 });

 /* LINE CHART (fake weekly trend for now) */
 if(lineChart) lineChart.destroy();

 lineChart=new Chart(document.getElementById("lineChart"),{
  type:"line",
  data:{
   labels:["Mon","Tue","Wed","Thu","Fri"],
   datasets:[{
    data:[70,75,80,78,85],
    borderColor:"#22c55e",
    tension:.4
   }]
  },
  options:{
   animation:{duration:1200},
   plugins:{legend:{display:false}}
  }
 });

 /* TABLE */
 let f="";
 Object.entries(d.report).forEach(([name,list])=>{
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

 let h="";
 Object.entries(d.subjectLectures).forEach(([s,v])=>{
  h+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });
 hTable.innerHTML=h;

}

setInterval(load,5000);
load();

</script>

</body>
</html>
`);
});

// ================== START ==================
app.get("/", (req,res)=> res.redirect("/dashboard"));

app.listen(PORT,()=>console.log("🚀 Production Server Running"));