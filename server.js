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

app.get("/dashboard",(req,res)=>{
  res.redirect("/home");
});

/* =========================
   LOG (UNCHANGED)
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
<h1 style="text-align:center">📊 Smart Dashboard</h1>
<div style="text-align:center">
<button onclick="go('/login')">Login</button>
<button onclick="go('/subject')">Subject</button>
<button onclick="go('/class')">Class</button>
<button onclick="go('/hod')">HOD</button>
</div>

<script>
function go(x){location=x}
</script>
`);
});

/* =========================
   LOGIN
========================= */
app.get("/login",(req,res)=>{
res.send(`
<h2 style="text-align:center">🔐 Login</h2>
<div style="text-align:center">
<input id="id" placeholder="Staff ID"><br><br>
<select id="role">
<option value="teacher">Teacher</option>
<option value="hod">HOD</option>
</select><br><br>
<button onclick="login()">Login</button>
</div>

<script>
function login(){
 let id=document.getElementById("id").value;
 let role=document.getElementById("role").value;

 if(role==="teacher"){
  location="/subject?staff="+id;
 }else{
  location="/hod";
 }
}
</script>
`);
});

/* =========================
   SMART API
========================= */
app.get("/api/data",(req,res)=>{

 const {className,batch,subject,period,staff} = req.query;

 const data=fs.readFileSync(csvPath,"utf8").split(/\\r?\\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;

  return {
    date:p[0],
    role:p[2],
    name:p[3],
    className:p[5],
    batch:p[6],
    subject:p[7]
  };
 }).filter(x=>x && x.role==="STUDENT");

 /* AUTO TEACHER SUBJECT */
 if(staff){
  let teacherSubjects = timetable
   .filter(t=>normalize(t.staff_id)===normalize(staff))
   .map(t=>t.subject);

  if(teacherSubjects.length>0){
   records = records.filter(r=>teacherSubjects.includes(r.subject));
  }
 }

 if(className) records=records.filter(r=>r.className===className);
 if(batch) records=records.filter(r=>r.batch===batch);
 if(subject) records=records.filter(r=>r.subject===subject);

 let now=new Date();

 if(period==="week"){
  let d=new Date(); d.setDate(now.getDate()-7);
  records=records.filter(r=>new Date(r.date)>=d);
 }

 if(period==="month"){
  let d=new Date(); d.setMonth(now.getMonth()-1);
  records=records.filter(r=>new Date(r.date)>=d);
 }

 let subjectWise={},classWise={},studentWise={},lectureMap={};

 records.forEach(r=>{
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  classWise[r.className]=(classWise[r.className]||0)+1;
  studentWise[r.name]=(studentWise[r.name]||0)+1;

  lectureMap[r.date+"-"+r.subject]=true;
 });

 let totalLectures=Object.keys(lectureMap).length || 1;

 let studentData={};
 Object.keys(studentWise).forEach(n=>{
  let p=(studentWise[n]/totalLectures)*100;
  studentData[n]={count:studentWise[n],percent:p.toFixed(1),def:p<75};
 });

 res.json({totalLectures,subjectWise,classWise,studentData});
});

/* =========================
   DASHBOARD UI
========================= */
function viewPage(title,mode){
return `
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{margin:0;font-family:Segoe UI;background:#0f172a;color:white;display:flex}
.sidebar{width:220px;background:#1e293b;padding:20px}
.sidebar button{width:100%;margin:5px;padding:10px;background:#6366f1;border:none;color:white}
.main{flex:1;padding:20px}
.card{display:inline-block;margin:10px;padding:20px;background:#111827;border-radius:10px}
</style>
</head>

<body>

<div class="sidebar">
<button onclick="go('/home')">Home</button>
<button onclick="go('/subject')">Subject</button>
<button onclick="go('/class')">Class</button>
<button onclick="go('/hod')">HOD</button>
</div>

<div class="main">

<div class="card">Lectures <span id="lec"></span></div>
<div class="card">Students <span id="stu"></span></div>
<div class="card">Defaulters <span id="def"></span></div>

<canvas id="bar"></canvas>

<table id="table"></table>

</div>

<script>
function go(x){location=x}

async function load(){
 let d=await fetch("/api/data").then(r=>r.json());

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 let labels=Object.keys(d.subjectWise);
 let values=Object.values(d.subjectWise);

 new Chart(document.getElementById("bar"),{
  type:"bar",
  data:{labels,datasets:[{data:values}]}
 });

 let t=document.getElementById("table");
 t.innerHTML="";
 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`<tr><td>\${n}</td><td>\${v.percent}%</td></tr>\`;
 });
}
load();
</script>

</body>
</html>
`;
}

app.get("/subject",(req,res)=>res.send(viewPage("Subject","subject")));
app.get("/class",(req,res)=>res.send(viewPage("Class","class")));
app.get("/hod",(req,res)=>res.send(viewPage("HOD","hod")));

/* =========================
   START
========================= */
app.listen(PORT,()=>console.log("🚀 Server running"));