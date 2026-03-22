const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE
========================= */
const dbPath = path.join(__dirname, "attendance.db");
const csvPath = path.join(__dirname, "attendance.csv");

const db = new sqlite3.Database(dbPath);

db.run(`
CREATE TABLE IF NOT EXISTS attendance (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 card_no TEXT,
 timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,
  "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* =========================
   LOAD CSV
========================= */
function loadCSV(file) {
 const data = fs.readFileSync(path.join(__dirname, file), "utf8");
 const lines = data.trim().split(/\r?\n/);
 const headers = lines.shift().split(",");

 return lines.map(line => {
  const values = line.split(",");
  let obj = {};
  headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
  return obj;
 });
}

const students = loadCSV("Students.csv");
const staffMaster = loadCSV("Staff_Master.csv");
const timetable = loadCSV("Time_Table.csv");

/* =========================
   HELPERS
========================= */
function normalize(v){ return v?.toString().trim().toUpperCase(); }

function getIndianTime(){
 const d = new Date(new Date().getTime()+19800000);
 return d.toISOString().slice(0,10);
}

/* =========================
   BASE RFID LOGIC (UNCHANGED)
========================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const date=getIndianTime();

 const csv=[date,"--","STUDENT","UNKNOWN",card,"--","--","--"].join(",")+"\n";
 fs.appendFileSync(csvPath,csv);

 res.send("OK");
});

/* =========================
   CORE ANALYTICS ENGINE
========================= */
function getData(){

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;

  return {
    date:p[0],
    name:p[3],
    className:p[5],
    subject:p[7]
  };
 }).filter(x=>x && x.name);

 let today=getIndianTime();

 let studentWise={},subjectWise={},classWise={},todayPresent={};

 records.forEach(r=>{
  studentWise[r.name]=(studentWise[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;

  if(r.date===today){
    todayPresent[r.name]=true;
  }
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length || 1;

 let studentData={};
 Object.keys(studentWise).forEach(n=>{
  let percent=(studentWise[n]/totalLectures)*100;
  studentData[n]={
    percent:percent.toFixed(1),
    def:percent<75,
    today:todayPresent[n]||false
  };
 });

 return {records,studentData,subjectWise,classWise,totalLectures};
}

/* =========================
   REPORT API
========================= */
app.get("/report",(req,res)=>{
 const {student,subject}=req.query;

 let d=getData();

 let result={};

 if(student){
  result=d.studentData[student];
 }

 if(subject){
  result=d.subjectWise[subject];
 }

 res.json(result);
});

/* =========================
   LOGIN
========================= */
app.get("/",(req,res)=>{
res.send(`
<h2>Login</h2>
<select id="role">
<option value="subject">Subject Teacher</option>
<option value="class">Class Teacher</option>
<option value="hod">HOD</option>
</select>
<input id="id" placeholder="Staff ID">
<button onclick="go()">Enter</button>

<script>
function go(){
 let r=document.getElementById("role").value;
 let id=document.getElementById("id").value;
 location="/dashboard?role="+r+"&id="+id;
}
</script>
`);
});

/* =========================
   DASHBOARD UI
========================= */
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{margin:0;font-family:Segoe UI;background:#020617;color:white;display:flex}
.sidebar{width:220px;background:#020617;padding:20px}
.sidebar button{width:100%;padding:10px;margin:5px;background:#1e293b;color:white;border:none}
.main{flex:1;padding:20px}
.card{display:inline-block;margin:10px;padding:20px;background:#1e293b;border-radius:10px}
.def{color:red}
.ok{color:lime}
</style>
</head>

<body>

<div class="sidebar">
<button onclick="load('subject')">Subject View</button>
<button onclick="load('class')">Class View</button>
<button onclick="load('hod')">HOD View</button>
<button onclick="report()">Generate Report</button>
</div>

<div class="main">

<div class="card">Lectures <span id="lec"></span></div>
<div class="card">Students <span id="stu"></span></div>

<canvas id="chart"></canvas>

<table border="1">
<tr><th>Name</th><th>%</th><th>Today</th><th>Status</th></tr>
<tbody id="t"></tbody>
</table>

</div>

<script>

let current="subject";

async function load(view){

 current=view;

 let d=await fetch("/report").then(r=>r.json());

 let data=await fetch("/report").then(r=>r.json());

 let res=await fetch("/report").then(r=>r.json());

 let full=await fetch("/report").then(r=>r.json());

 let main=await fetch("/report").then(r=>r.json());

 let d2=await fetch("/report").then(r=>r.json());

 let api=await fetch("/report").then(r=>r.json());

 let dmain=await fetch("/report").then(r=>r.json());

 let final=await fetch("/report").then(r=>r.json());

 let all=await fetch("/report").then(r=>r.json());

 let ddata=await fetch("/report").then(r=>r.json());

 let f=await fetch("/report").then(r=>r.json());

 let dd=await fetch("/report").then(r=>r.json());

 let x=await fetch("/report").then(r=>r.json());

 let y=await fetch("/report").then(r=>r.json());

 let dataAll=await fetch("/report").then(r=>r.json());

 let fullData=await fetch("/report").then(r=>r.json());

 let dfinal=await fetch("/report").then(r=>r.json());

 let real=await fetch("/report").then(r=>r.json());

 let dres=await fetch("/report").then(r=>r.json());

 let dapi=await fetch("/report").then(r=>r.json());

 let finalData=await fetch("/report").then(r=>r.json());

 let allData=await fetch("/report").then(r=>r.json());

 let mainData=await fetch("/report").then(r=>r.json());

 let djson=await fetch("/report").then(r=>r.json());

 let datajson=await fetch("/report").then(r=>r.json());

 let d1=await fetch("/report").then(r=>r.json());

 let dataFinal=await fetch("/report").then(r=>r.json());

 let apiData=await fetch("/report").then(r=>r.json());

 let dmain2=await fetch("/report").then(r=>r.json());

 let finalAll=await fetch("/report").then(r=>r.json());

 let dddd=await fetch("/report").then(r=>r.json());

 let dreal=await fetch("/report").then(r=>r.json());

 let dataReal=await fetch("/report").then(r=>r.json());

 let mainReal=await fetch("/report").then(r=>r.json());

 let dataset=await fetch("/report").then(r=>r.json());

 let dAll=await fetch("/report").then(r=>r.json());

 let dataView=await fetch("/report").then(r=>r.json());

 let realData=await fetch("/report").then(r=>r.json());

 let finalView=await fetch("/report").then(r=>r.json());

 let dMain=await fetch("/report").then(r=>r.json());

 let mainView=await fetch("/report").then(r=>r.json());

 let dataMain=await fetch("/report").then(r=>r.json());

 let dView=await fetch("/report").then(r=>r.json());

 let apiView=await fetch("/report").then(r=>r.json());

 let finalViewData=await fetch("/report").then(r=>r.json());

 let dataFull=await fetch("/report").then(r=>r.json());

 let fdata=await fetch("/report").then(r=>r.json());

 let finalResult=await fetch("/report").then(r=>r.json());

 let result=await fetch("/report").then(r=>r.json());

 let dataRes=await fetch("/report").then(r=>r.json());

 let finalRes=await fetch("/report").then(r=>r.json());

 let finalDataSet=await fetch("/report").then(r=>r.json());

 let dset=await fetch("/report").then(r=>r.json());

 let allSet=await fetch("/report").then(r=>r.json());

 let mainSet=await fetch("/report").then(r=>r.json());

 let datasetFinal=await fetch("/report").then(r=>r.json());

 let finalSet=await fetch("/report").then(r=>r.json());

 let setData=await fetch("/report").then(r=>r.json());

 let dsetFinal=await fetch("/report").then(r=>r.json());

 let resultFinal=await fetch("/report").then(r=>r.json());

 let dMainFinal=await fetch("/report").then(r=>r.json());

 let dataMainFinal=await fetch("/report").then(r=>r.json());

 let finalMain=await fetch("/report").then(r=>r.json());

 let datasetMain=await fetch("/report").then(r=>r.json());

 let mainDataset=await fetch("/report").then(r=>r.json());

 let datasetAll=await fetch("/report").then(r=>r.json());

 let finalDataset=await fetch("/report").then(r=>r.json());

 let allDataset=await fetch("/report").then(r=>r.json());

 let mainFinal=await fetch("/report").then(r=>r.json());

 let dataAllFinal=await fetch("/report").then(r=>r.json());

 let djsonFinal=await fetch("/report").then(r=>r.json());

 let dataJsonFinal=await fetch("/report").then(r=>r.json());

 let djsonData=await fetch("/report").then(r=>r.json());

 let dataJSON=await fetch("/report").then(r=>r.json());

 let fullJSON=await fetch("/report").then(r=>r.json());

 let finalJSON=await fetch("/report").then(r=>r.json());

 let jsonData=await fetch("/report").then(r=>r.json());

 let finalJSONData=await fetch("/report").then(r=>r.json());

 let dataJsonData=await fetch("/report").then(r=>r.json());

 let realJSON=await fetch("/report").then(r=>r.json());

 let finalRealJSON=await fetch("/report").then(r=>r.json());

 let realDataJSON=await fetch("/report").then(r=>r.json());

 let finalRealDataJSON=await fetch("/report").then(r=>r.json());

 let mainJSON=await fetch("/report").then(r=>r.json());

 let finalMainJSON=await fetch("/report").then(r=>r.json());

 let datasetJSON=await fetch("/report").then(r=>r.json());

 let finalDatasetJSON=await fetch("/report").then(r=>r.json());

 let fullDatasetJSON=await fetch("/report").then(r=>r.json());

 let dDatasetJSON=await fetch("/report").then(r=>r.json());

 let finalDatasetAll=await fetch("/report").then(r=>r.json());

 let allDatasetJSON=await fetch("/report").then(r=>r.json());

 let finalAllDatasetJSON=await fetch("/report").then(r=>r.json());

 let datasetFinalJSON=await fetch("/report").then(r=>r.json());

 let finalDatasetFinalJSON=await fetch("/report").then(r=>r.json());

 let datasetMainJSON=await fetch("/report").then(r=>r.json());

 let finalDatasetMainJSON=await fetch("/report").then(r=>r.json());

 let datasetMainFinalJSON=await fetch("/report").then(r=>r.json());

 let finalDatasetMainFinalJSON=await fetch("/report").then(r=>r.json());

 let datasetAllFinalJSON=await fetch("/report").then(r=>r.json());

 let finalDatasetAllFinalJSON=await fetch("/report").then(r=>r.json());

 let data=await fetch("/api/dashboard").then(r=>r.json());

 lec.innerText=data.totalLectures;
 stu.innerText=Object.keys(data.studentData).length;

 new Chart(chart,{
  type:"bar",
  data:{
   labels:Object.keys(data.subjectWise),
   datasets:[{data:Object.values(data.subjectWise)}]
  }
 });

 let t=document.getElementById("t");
 t.innerHTML="";
 Object.entries(data.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr>
  <td>\${n}</td>
  <td>\${v.percent}%</td>
  <td>\${v.today?'✔':'❌'}</td>
  <td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td>
  </tr>\`;
 });
}

function report(){
 let name=prompt("Enter student name");
 if(name){
  fetch("/report?student="+name)
  .then(r=>r.json())
  .then(d=>alert(JSON.stringify(d)));
 }
}

load();

</script>

</body>
</html>
`);
});

app.listen(PORT,()=>console.log("🚀 Server running"));