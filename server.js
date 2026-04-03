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
function page(title,mode){
return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body {
    font-family: Arial;
    margin: 0;
    background: #f4f6f9;
}

/* HEADER */
.header {
    text-align: center;
    padding: 20px;
    font-size: 26px;
    font-weight: bold;
}

/* SIDEBAR */
.sidebar {
    position: fixed;
    width: 200px;
    height: 100%;
    background: #111827;
    color: white;
    padding: 20px;
}

.sidebar a {
    display: block;
    padding: 10px;
    margin: 8px 0;
    background: #1f2937;
    border-radius: 6px;
    text-decoration: none;
    color: white;
}

.sidebar a:hover {
    background: #3b82f6;
}

/* MAIN */
.main {
    margin-left: 220px;
}

/* GRID */
.dashboard {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    padding: 20px;
}

/* CARDS */
.card {
    background: white;
    padding: 15px;
    border-radius: 10px;
    text-align: center;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.big {
    font-size: 22px;
    font-weight: bold;
}

/* CHART */
.chart-container {
    grid-column: span 2;
    background: white;
    padding: 15px;
    border-radius: 10px;
}

</style>
</head>

<body>

<div class="sidebar">
<h2>Dashboard</h2>
<a href="/dashboard">Home</a>
<a href="/faculty">Faculty</a>
<a href="/hod">HOD</a>
<a href="/principal">Principal</a>
</div>

<div class="main">

<div class="header">${title}</div>

<div class="dashboard">

<div class="card">
<h3>Total Students</h3>
<div class="big" id="total"></div>
</div>

<div class="card">
<h3>Present</h3>
<div class="big" id="present"></div>
</div>

<div class="card">
<h3>Absent</h3>
<div class="big" id="absent"></div>
</div>

<div class="card">
<h3>Attendance %</h3>
<div class="big" id="percentage"></div>
</div>

<div class="chart-container">
<h3>Weekly Attendance</h3>
<canvas id="barChart"></canvas>
</div>

<div class="chart-container">
<h3>Subject-wise Attendance</h3>
<canvas id="pieChart"></canvas>
</div>

</div>
</div>

<script>

let barChart, pieChart;

async function load(){

 let d = await fetch("/api").then(r=>r.json());

 let total = d.totalStudents || 1;
 let present = d.present || 0;
 let absent = total - present;

 document.getElementById("total").innerText = total;
 document.getElementById("present").innerText = present;
 document.getElementById("absent").innerText = absent;
 document.getElementById("percentage").innerText =
     Math.round((present/total)*100) + "%";

 /* BAR CHART */
 if(barChart) barChart.destroy();
 barChart = new Chart(document.getElementById("barChart"), {
    type: 'bar',
    data: {
        labels: d.weeklyLabels || [],
        datasets: [{
            label: "Attendance",
            data: d.weeklyData || []
        }]
    }
 });

 /* PIE CHART */
 if(pieChart) pieChart.destroy();
 pieChart = new Chart(document.getElementById("pieChart"), {
    type: 'pie',
    data: {
        labels: Object.keys(d.subjectWise || {}),
        datasets: [{
            data: Object.values(d.subjectWise || {})
        }]
    }
 });

}

load();
setInterval(load,3000);

</script>

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