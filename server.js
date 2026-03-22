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

app.get("/dashboard",(req,res)=>res.redirect("/home"));

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
   ADVANCED API
========================= */
app.get("/api/data",(req,res)=>{

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

 let lectureMap={},studentWise={},subjectWise={},classWise={};

 records.forEach(r=>{
  lectureMap[r.date+"-"+r.subject]=true;
  studentWise[r.name]=(studentWise[r.name]||0)+1;
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
 });

 let actualLectures=Object.keys(lectureMap).length;

 // EXPECTED FROM TIMETABLE
 let expectedLectures=timetable.length;

 let studentData={};
 Object.keys(studentWise).forEach(n=>{
  let percent=(studentWise[n]/actualLectures)*100;
  studentData[n]={
    percent:percent.toFixed(1),
    def:percent<75,
    shortage:percent<75
  };
 });

 res.json({
  actualLectures,
  expectedLectures,
  studentData,
  subjectWise,
  classWise
 });
});

/* =========================
   HOME
========================= */
app.get("/home",(req,res)=>{
res.send(`
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body style="background:#020617;color:white;font-family:Segoe UI">

<h1>📊 Smart Attendance Dashboard</h1>

<div>
Lectures: <span id="lec"></span> |
Expected: <span id="exp"></span>
</div>

<canvas id="bar"></canvas>

<script>
async function load(){
 let d=await fetch("/api/data").then(r=>r.json());

 lec.innerText=d.actualLectures;
 exp.innerText=d.expectedLectures;

 new Chart(bar,{
  type:"bar",
  data:{
   labels:Object.keys(d.classWise),
   datasets:[{data:Object.values(d.classWise)}]
  }
 });
}
load();
</script>

</body>
</html>
`);
});

/* =========================
   VIEW
========================= */
function viewPage(title){
return `
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body style="background:#020617;color:white;font-family:Segoe UI">

<h2>${title}</h2>

<canvas id="bar"></canvas>

<table border="1">
<tr><th>Name</th><th>%</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

<script>
async function load(){
 let d=await fetch("/api/data").then(r=>r.json());

 new Chart(bar,{
  type:"bar",
  data:{
   labels:Object.keys(d.subjectWise),
   datasets:[{data:Object.values(d.subjectWise)}]
  }
 });

 let t=document.getElementById("table");
 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr>
  <td>\${n}</td>
  <td>\${v.percent}%</td>
  <td>\${v.def?'⚠ Defaulter':'OK'}</td>
  </tr>\`;
 });
}
load();
</script>

</body>
</html>
`;
}

app.get("/subject",(req,res)=>res.send(viewPage("Subject")));
app.get("/class",(req,res)=>res.send(viewPage("Class")));
app.get("/hod",(req,res)=>res.send(viewPage("HOD")));

app.listen(PORT,()=>console.log("🚀 Server running"));