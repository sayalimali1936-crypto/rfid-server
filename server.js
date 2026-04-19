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

/* ================= API ================= */
app.get("/api/dashboard",(req,res)=>{

 const data = fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records = data.map(l=>{
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

 /* LECTURES */
 let lectureSet=new Set();
 records.forEach(r=>lectureSet.add(r.subject+"_"+r.date));

 let subjectLectures={};
 lectureSet.forEach(k=>{
  let s=k.split("_")[0];
  subjectLectures[s]=(subjectLectures[s]||0)+1;
 });

 /* STUDENT */
 let studentMap={};
 records.forEach(r=>{
  if(!studentMap[r.name]) studentMap[r.name]={};
  studentMap[r.name][r.subject]=(studentMap[r.name][r.subject]||0)+1;
 });

 let report={};
 Object.keys(studentMap).forEach(name=>{
  report[name]=[];
  Object.keys(studentMap[name]).forEach(sub=>{
    let attended=studentMap[name][sub];
    let total=subjectLectures[sub]||1;
    let percent=((attended/total)*100).toFixed(1);

    report[name].push({
      subject:sub,
      percent,
      defaulter:percent<75
    });
  });
 });

 let totalStudents = Object.keys(studentMap).length;

 res.json({
  report,
  subjectLectures,
  present: totalStudents,
  absent: 0,
  percent: "100"
 });

});

/* ================= DASHBOARD ================= */
app.get("/dashboard",(req,res)=>{
res.send(`<!DOCTYPE html>
<html>
<head>
<title>Attendance System</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;font-family:Segoe UI;background:#0f172a;color:white;display:flex}

/* SIDEBAR */
.sidebar{
 width:230px;
 background:#020617;
 padding:20px;
 border-right:1px solid #1e293b;
}

.logo{
 font-size:18px;
 margin-bottom:20px;
}

.nav{
 padding:12px;
 margin:6px 0;
 border-radius:8px;
 background:#1e293b;
 cursor:pointer;
}
.nav:hover{background:#2563eb}
.active{background:#2563eb}

/* MAIN */
.main{
 flex:1;
 padding:20px;
}

/* CARDS */
.cards{
 display:flex;
 gap:15px;
 margin-bottom:20px;
}

.card{
 flex:1;
 background:#1e293b;
 padding:15px;
 border-radius:10px;
 text-align:center;
}

.value{font-size:22px}

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

.red{color:#ef4444}
.green{color:#22c55e}

/* VIEW */
.view{display:none}
.view.active{display:block}
</style>
</head>

<body>

<div class="sidebar">
<div class="logo">📊 Attendance</div>

<div class="nav active" onclick="show('home',this)">Dashboard</div>
<div class="nav" onclick="show('faculty',this)">Faculty</div>
<div class="nav" onclick="show('hod',this)">HOD</div>
</div>

<div class="main">

<!-- DASHBOARD -->
<div id="home" class="view active">

<div class="cards">
<div class="card">Present<div class="value" id="present"></div></div>
<div class="card">Absent<div class="value" id="absent"></div></div>
<div class="card">%<div class="value" id="percent"></div></div>
</div>

<canvas id="chart"></canvas>

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

let chart;

async function load(){

 const res=await fetch("/api/dashboard");
 const d=await res.json();

 present.innerText=d.present;
 absent.innerText=d.absent;
 percent.innerText=d.percent+"%";

 /* CHART */
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

 /* FACULTY */
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

 /* HOD */
 let h="";
 Object.entries(d.subjectLectures).forEach(([s,v])=>{
  h+=\`<tr><td>\${s}</td><td>\${v}</td></tr>\`;
 });

 hTable.innerHTML=h;

}

load();

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.get("/", (req,res)=> res.redirect("/dashboard"));

app.get("/dashboard", ...)

app.get("/api/dashboard", ...)
app.listen(PORT,()=>console.log("🚀 Server running"));