const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const { jsPDF } = require("jspdf");
const { Parser } = require("json2csv");

const app = express();
const PORT = process.env.PORT || 10000;

/* ================= DATABASE ================= */
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

/* ================= LOAD CSV ================= */
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

/* ================= HELPERS ================= */
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

/* ================= RFID LOG ================= */
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

/* ================= API ================= */
app.get("/api/data",(req,res)=>{

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],batch:p[6],subject:p[7]};
 }).filter(x=>x && x.name && x.name!=="UNKNOWN");

 let student={},subjectWise={},classWise={};

 records.forEach(r=>{
  student[r.name]=(student[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let totalLectures=[...new Set(records.map(r=>r.date+r.subject))].length || 1;

 let studentData={};
 Object.keys(student).forEach(n=>{
  let p=(student[n]/totalLectures)*100;
  studentData[n]={percent:p.toFixed(1),def:p<75};
 });

 res.json({totalLectures,studentData,subjectWise,classWise});
});

/* ================= UI ================= */
function viewPage(title,mode){
return `
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{background:#0f172a;color:white;font-family:Segoe UI;padding:20px}
.cards{display:flex;gap:15px}
.card{flex:1;background:#1e293b;padding:20px;border-radius:10px;text-align:center}
table{width:100%;margin-top:20px;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
.def{color:red}
.ok{color:lime}
</style>
</head>

<body>

<h2>${title}</h2>

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Students <h2 id="stu"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<canvas id="chart"></canvas>

<table>
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

<script>

async function load(){

 let d=await fetch("/api/data").then(r=>r.json());

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels = "${mode}"==="hod" ? Object.keys(d.classWise) : Object.keys(d.subjectWise);
 let values = "${mode}"==="hod" ? Object.values(d.classWise) : Object.values(d.subjectWise);

 new Chart(chart,{type:"bar",data:{labels,datasets:[{data:values}]}});

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

load();

</script>

</body>
</html>
`;
}

/* ================= ROUTES ================= */
app.get("/",(req,res)=>res.redirect("/home"));

app.get("/home",(req,res)=>{
res.send(`
<h1 style="text-align:center">Dashboard</h1>
<div style="text-align:center">
<button onclick="location='/subject'">Subject</button>
<button onclick="location='/class'">Class</button>
<button onclick="location='/hod'">HOD</button>
</div>
`);
});

app.get("/subject",(req,res)=>res.send(viewPage("Subject Dashboard","subject")));
app.get("/class",(req,res)=>res.send(viewPage("Class Dashboard","class")));
app.get("/hod",(req,res)=>res.send(viewPage("HOD Dashboard","hod")));

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));