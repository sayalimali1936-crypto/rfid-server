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

function timeToMinutes(t){
 const [h,m]=t.split(":").map(Number);
 return h*60+m;
}

function identifyCard(cardNo){
 const student = students.find(s=>normalize(s.card_no)===normalize(cardNo));
 if(student) return {type:"STUDENT",data:student};

 const staff = staffMaster.find(s=>normalize(s.staff_card_no)===normalize(cardNo));
 if(staff) return {type:"STAFF",data:staff};

 return {type:"UNKNOWN",data:null};
}

function getIndianTime(){
 const d = new Date(new Date().getTime()+19800000);
 const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 return {
  date:d.toISOString().slice(0,10),
  time:d.toTimeString().slice(0,5),
  day:days[d.getDay()]
 };
}

function getActiveSlot(day,time,identity){
 const now=timeToMinutes(time);

 return timetable.find(slot=>{
  if(normalize(slot.day)!==normalize(day)) return false;

  const start=timeToMinutes(slot.start_time.slice(0,5));
  const end=timeToMinutes(slot.end_time.slice(0,5));

  if(now<start || now>end) return false;

  if(identity.type==="STUDENT"){
   return normalize(slot.class)===normalize(identity.data.class);
  }

  if(identity.type==="STAFF"){
   return normalize(slot.staff_id)===normalize(identity.data.staff_id);
  }

  return false;
 });
}

/* =========================
   ROUTES
========================= */
app.get("/",(req,res)=>res.send("RFID Running"));
app.get("/dashboard",(req,res)=>{ res.redirect("/home"); });

/* =========================
   LOG
========================= */
app.get("/log",(req,res)=>{
 const card=req.query.card_no;
 if(!card) return res.send("NO_CARD");

 const id=identifyCard(card);
 const {date,time,day}=getIndianTime();

 const slot=getActiveSlot(day,time,id);
 if(!slot) return res.send("NO_SLOT");

 db.run(`INSERT INTO attendance (card_no) VALUES (?)`,[normalize(card)]);

 const csv=[date,time,id.type,
  id.data?.student_name || id.data?.staff_name || "UNKNOWN",
  card,
  slot.class,
  id.data?.batch || slot.batch,
  slot.subject
 ].join(",")+"\n";

 fs.appendFileSync(csvPath,csv);

 res.send("OK");
});

/* =========================
   DOWNLOAD
========================= */
app.get("/download",(req,res)=>res.download(csvPath));

/* =========================
   HOME PAGE
========================= */
app.get("/home",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Smart Attendance Dashboard</title>
<style>
body{font-family:'Segoe UI';background:#0f172a;color:white;text-align:center;margin:0;padding:0;}
h1{margin-top:40px;}
button{margin:10px;padding:12px 20px;border:none;border-radius:8px;background:#6366f1;color:white;cursor:pointer;transition:0.3s;}
button:hover{background:#4f46e5;}
</style>
</head>
<body>
<h1>📊 Smart Attendance Dashboard</h1>
<div>
<button onclick="go('/subject')">📘 Subject Teacher</button>
<button onclick="go('/class')">👩‍🏫 Class Teacher</button>
<button onclick="go('/hod')">🏫 HOD</button>
</div>
<script>
function go(x){location=x}
</script>
</body>
</html>
`);
});

/* =========================
   API with Filters
========================= */
app.get("/api/data",(req,res)=>{
 const {subject,student,class:cls,batch,period} = req.query;

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],batch:p[6],subject:p[7]};
 }).filter(x=>x && x.name);

 // Apply filters
 if(subject) records=records.filter(r=>r.subject===subject);
 if(student) records=records.filter(r=>r.name===student);
 if(cls) records=records.filter(r=>r.className===cls);
 if(batch) records=records.filter(r=>r.batch===batch);

 let student={},subjectWise={},classWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/totalLectures)*100;
  studentData[n]={count:student[n],percent:p.toFixed(1),def:p<75};
 });

 res.json({totalLectures,studentData,subjectWise,classWise});
});

/* =========================
   VIEW GENERATOR
========================= */
function viewPage(title,mode){
return `
<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{margin:0;font-family:'Segoe UI';display:flex;background:#0f172a;color:white;}
.sidebar{width:220px;background:#1e293b;padding:20px;}
.sidebar h2{text-align:center;}
.sidebar button{width:100%;padding:10px;margin:6px 0;border:none;border-radius:8px;background:#6366f1;color:white;cursor:pointer;}
.sidebar button:hover{background:#4f46e5;}
.main{flex:1;padding:20px;}
.cards{display:flex;gap:15px;margin-bottom:20px;}
.card{flex:1;padding:20px;border-radius:12px;background:#1e293b;text-align:center;}
.card h2{margin:0;}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;}
.section{background:#1e293b;padding:20px;border-radius:12px;margin-top:20px;}
table{width:100%;border-collapse:collapse;}
th,td{padding:10px;border-bottom:1px solid #334155;}
.def{color:#ef4444}.ok{color:#22c55e}
.filters{background:#1e293b;padding:15px;border-radius:12px;margin-top:20px;}
.filters select, .filters input{width:100%;padding:8px;margin:6px 0;border-radius:6px;}
</style>
</head>
<body>
<div class="sidebar">
<h2>📊 Dashboard</h2>
<button onclick="go('/home')">🏠 Home</button>
<button onclick="go('/subject')">📘 Subject</button>
<button onclick="go('/class')">👩‍🏫 Class</button>
<button onclick="go('/hod')">🏫 HOD</button>
<hr>
<button onclick="exportData()">⬇ Export</button>
</div>
<div class="main">
<h2>${title}</h2>

<div class="cards">
<div class="card">Lectures<h2 id="lec"></h2></div>
<div class="card">Students<h2 id="stu"></h2></div>
<div class="card">Defaulters<h2 id="def"></h2></div>
</div>

<div class="filters" id="filters"></div>

<div class="grid">
<div class="section"><canvas id="bar"></canvas></div>
<div class="section"><canvas id="pie"></canvas></div>
</div>
<div class="section"><canvas id="line"></canvas></div>

<div class="section">
<table>
<thead><tr><th>Name</th><th>%</th><th>Status</th></tr></thead>
<tbody id="table"></tbody>
</table>
</div>

<div class="section">
<h3>Generate Report</h3>
<div id="reportControls"></div>
</div>

</div>
<script>
let barChart,pieChart,lineChart;
function go(x){window.location=x}

function renderFilters(){
 let f=document.getElementById("filters");
 if("${mode}"==="subject"){
   f.innerHTML=\`
   <h3>Filter by Subject</h3>
   <select id="subjectFilter"><option value="">All</option></select>
   <button onclick="load()">Apply</button>\`;
 }
 else if("${mode}"==="class"){
   f.innerHTML=\`
   <h3>Filters</h3>
   <select id="subjectFilter"><option value="">All Subjects</option></select>
   <select id="batchFilter"><option value="">All Batches</option><option>A</option><option>B</option><option>C</option></select>
   <input id="studentSearch" placeholder="Search Student">
   <button onclick="load()">Apply</button>\`;
 }
 else{ // HOD
   f.innerHTML=\`
   <h3>Filter by Class/Batch</h3>
   <select id="classFilter"><option value="">All Classes</option><option>SE</option><option>TE</option><option>BE</option></select>
   <select id="batchFilter"><option value="">All Batches</option><option>A</option><option>B</option><option>C</option></select>
   <button onclick="load()">Apply</button>\`;
 }
}

function renderReportControls(){
 let rc=document.getElementById("reportControls");
 if("${mode}"==="subject"){
   rc.innerHTML=\`
   <input id="reportSubject" placeholder="Enter Subject">
   <button onclick="genReport('subject')">Generate Subject Report</button>\`;
 }
 else if("${mode}"==="class"){
   rc.innerHTML=\`
   <input id="reportStudent" placeholder="Enter Student Name">
   <input id="reportSubject" placeholder="Enter Subject">
   <button onclick="genReport('student')">Generate Student Report</button>
   <button onclick="genReport('subject')">Generate Subject Report</button>\`;
 }
 else{ // HOD
   rc.innerHTML=\`
   <input id="reportClass" placeholder="Enter Class">
   <button onclick="genReport('class')">Generate Class Report</button>\`;
 }
}

function genReport(type){
 let url="/report?";
 if(type==="student"){
   let s=document.getElementById("reportStudent").value;
   if(s) url+="student="+encodeURIComponent(s);
 }
 if(type==="subject"){
   let subj=document.getElementById("reportSubject").value;
   if(subj) url+="subject="+encodeURIComponent(subj);
 }
 if(type==="class"){
   let cls=document.getElementById("reportClass").value;
   if(cls) url+="class="+encodeURIComponent(cls);
 }
 window.open(url,"_blank");
}

async function load(){
 let url="/api/data?";
 if("${mode}"==="subject"){
   let subj=document.getElementById("subjectFilter").value;
   if(subj) url+="subject="+encodeURIComponent(subj);
 }
 else if("${mode}"==="class"){
   let subj=document.getElementById("subjectFilter").value;
   let batch=document.getElementById("batchFilter").value;
   let search=document.getElementById("studentSearch").value;
   if(subj) url+="subject="+encodeURIComponent(subj)+"&";
   if(batch) url+="batch="+encodeURIComponent(batch)+"&";
   if(search) url+="student="+encodeURIComponent(search);
 }
 else{ // HOD
   let cls=document.getElementById("classFilter").value;
   let batch=document.getElementById("batchFilter").value;
   if(cls) url+="class="+encodeURIComponent(cls)+"&";
   if(batch) url+="batch="+encodeURIComponent(batch);
 }

 let d=await fetch(url).then(r=>r.json());
 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels,values;
 if("${mode}"==="subject"){
   labels=Object.keys(d.subjectWise);
   values=Object.values(d.subjectWise);
 }
 else if("${mode}"==="class"){
   labels=Object.keys(d.studentData);
   values=Object.values(d.studentData).map(x=>x.count);
 }
 else{ // HOD
   labels=Object.keys(d.classWise);
   values=Object.values(d.classWise);
 }

 if(barChart) barChart.destroy();
 barChart=new Chart(document.getElementById("bar"),{
   type:"bar",
   data:{labels:labels,datasets:[{data:values,backgroundColor:"#6366f1"}]}
 });

 if(pieChart) pieChart.destroy();
 pieChart=new Chart(document.getElementById("pie"),{
   type:"doughnut",
   data:{labels:labels,datasets:[{data:values}]}
 });

 if(lineChart) lineChart.destroy();
 lineChart=new Chart(document.getElementById("line"),{
   type:"line",
   data:{labels:labels,datasets:[{data:values,borderColor:"#22c55e"}]}
 });

 let t=document.getElementById("table");
 t.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
   t.innerHTML+=\`
   <tr>
     <td>\${n}</td>
     <td>\${v.percent}%</td>
     <td class="\${v.def?'def':'ok'}">\${v.def?'Defaulter':'OK'}</td>
   </tr>\`;
 });
}
function exportData(){ window.location="/download"; }
renderFilters();
renderReportControls();
load();
setInterval(load,5000);
</script>
</body>
</html>
`;
}
/* =========================
   REPORT GENERATION
========================= */
app.get("/report",(req,res)=>{
 const {student,subject} = req.query;

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],batch:p[6],subject:p[7]};
 }).filter(x=>x && x.name);

 // Filter by student or subject
 if(student) records=records.filter(r=>r.name===student);
 if(subject) records=records.filter(r=>r.subject===subject);

 if(records.length===0){
   return res.send(`<h2>No records found for ${student||subject}</h2>`);
 }

 // Aggregate stats
 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length;
 let presentCount=records.length;
 let percent=((presentCount/totalLectures)*100).toFixed(1);

 // Defaulter check
 let defaulter=percent<75;

 // Build HTML report
 let html=`
 <h1>📑 Report</h1>
 <p><b>Student:</b> ${student||"All"}</p>
 <p><b>Subject:</b> ${subject||"All"}</p>
 <p><b>Total Lectures:</b> ${totalLectures}</p>
 <p><b>Present Count:</b> ${presentCount}</p>
 <p><b>Attendance %:</b> ${percent}%</p>
 <p><b>Status:</b> ${defaulter?"❌ Defaulter":"✅ OK"}</p>
 <hr>
 <h3>Detailed Records</h3>
 <table border="1" cellpadding="6">
 <tr><th>Date</th><th>Name</th><th>Class</th><th>Batch</th><th>Subject</th></tr>
 ${records.map(r=>`<tr><td>${r.date}</td><td>${r.name}</td><td>${r.className}</td><td>${r.batch}</td><td>${r.subject}</td></tr>`).join("")}
 </table>
 `;

 res.send(html);
});
/* =========================
   REPORT GENERATION + EXPORT
========================= */
const { jsPDF } = require("jspdf"); // install with: npm install jspdf
const { Parser } = require("json2csv"); // install with: npm install json2csv

app.get("/report",(req,res)=>{
 const {student,subject,format} = req.query;

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],batch:p[6],subject:p[7]};
 }).filter(x=>x && x.name);

 // Apply filters
 if(student) records=records.filter(r=>r.name===student);
 if(subject) records=records.filter(r=>r.subject===subject);

 if(records.length===0){
   return res.send(`<h2>No records found for ${student||subject}</h2>`);
 }

 // Aggregate stats
 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length;
 let presentCount=records.length;
 let percent=((presentCount/totalLectures)*100).toFixed(1);
 let defaulter=percent<75;

 // Export as CSV
 if(format==="csv"){
   const parser = new Parser();
   const csv = parser.parse(records);
   res.header("Content-Type","text/csv");
   res.attachment(`${student||subject||"report"}.csv`);
   return res.send(csv);
 }

 // Export as PDF
 if(format==="pdf"){
   const doc = new jsPDF();
   doc.setFontSize(14);
   doc.text("Attendance Report", 20, 20);
   doc.text(`Student: ${student||"All"}`, 20, 30);
   doc.text(`Subject: ${subject||"All"}`, 20, 40);
   doc.text(`Total Lectures: ${totalLectures}`, 20, 50);
   doc.text(`Present Count: ${presentCount}`, 20, 60);
   doc.text(`Attendance %: ${percent}%`, 20, 70);
   doc.text(`Status: ${defaulter?"Defaulter":"OK"}`, 20, 80);

   let y=100;
   records.forEach(r=>{
     doc.text(`${r.date} | ${r.name} | ${r.className} | ${r.batch} | ${r.subject}`, 20, y);
     y+=10;
   });

   const pdfBuffer = doc.output("arraybuffer");
   res.header("Content-Type","application/pdf");
   res.attachment(`${student||subject||"report"}.pdf`);
   return res.send(Buffer.from(pdfBuffer));
 }

 // Default: HTML view
 let html=`
 <h1>📑 Report</h1>
 <p><b>Student:</b> ${student||"All"}</p>
 <p><b>Subject:</b> ${subject||"All"}</p>
 <p><b>Total Lectures:</b> ${totalLectures}</p>
 <p><b>Present Count:</b> ${presentCount}</p>
 <p><b>Attendance %:</b> ${percent}%</p>
 <p><b>Status:</b> ${defaulter?"❌ Defaulter":"✅ OK"}</p>
 <hr>
 <h3>Detailed Records</h3>
 <table border="1" cellpadding="6">
 <tr><th>Date</th><th>Name</th><th>Class</th><th>Batch</th><th>Subject</th></tr>
 ${records.map(r=>`<tr><td>${r.date}</td><td>${r.name}</td><td>${r.className}</td><td>${r.batch}</td><td>${r.subject}</td></tr>`).join("")}
 </table>
 <hr>
 <a href="/report?${student?`student=${student}&`:''}${subject?`subject=${subject}&`:''}format=pdf">⬇ Download PDF</a><br>
 <a href="/report?${student?`student=${student}&`:''}${subject?`subject=${subject}&`:''}format=csv">⬇ Download CSV</a>
 `;

 res.send(html);
});