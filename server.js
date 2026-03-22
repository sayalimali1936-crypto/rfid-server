const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const { jsPDF } = require("jspdf");   // npm install jspdf
const { Parser } = require("json2csv"); // npm install json2csv

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
 const {subject,student,class:cls,batch} = req.query;

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
/* styles omitted for brevity — include the full CSS from earlier */
</style>
</head>
<body>
<!-- sidebar, cards, filters, charts, table, report controls -->
<!-- full HTML/JS from the corrected viewPage() we built earlier -->
</body>
</html>
`;
}

/* =========================
   DASHBOARD ROUTES
========================= */
app.get("/subject",(req,res)=>res.send(viewPage("Subject Teacher Dashboard","subject")));
app.get("/class",(req,res)=>res.send(viewPage("Class Teacher Dashboard","class")));
app.get("/hod",(req,res)=>res.send(viewPage("HOD Dashboard","hod")));

/* =========================
   REPORT GENERATION + EXPORT
========================= */
const { jsPDF } = require("jspdf");   // install: npm install jspdf
const { Parser } = require("json2csv"); // install: npm install json2csv

app.get("/report",(req,res)=>{
 const {student,subject,class:cls,batch,format} = req.query;

 const data=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],batch:p[6],subject:p[7]};
 }).filter(x=>x && x.name);

 // Apply filters
 if(student) records=records.filter(r=>r.name===student);
 if(subject) records=records.filter(r=>r.subject===subject);
 if(cls) records=records.filter(r=>r.className===cls);
 if(batch) records=records.filter(r=>r.batch===batch);

 if(records.length===0){
   return res.send(`<h2>No records found for ${student||subject||cls||batch}</h2>`);
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
   res.attachment(`${student||subject||cls||batch||"report"}.csv`);
   return res.send(csv);
 }

 // Export as PDF
 if(format==="pdf"){
   const doc = new jsPDF();
   doc.setFontSize(14);
   doc.text("Attendance Report", 20, 20);
   doc.text(`Student: ${student||"All"}`, 20, 30);
   doc.text(`Subject: ${subject||"All"}`, 20, 40);
   doc.text(`Class: ${cls||"All"}`, 20, 50);
   doc.text(`Batch: ${batch||"All"}`, 20, 60);
   doc.text(`Total Lectures: ${totalLectures}`, 20, 70);
   doc.text(`Present Count: ${presentCount}`, 20, 80);
   doc.text(`Attendance %: ${percent}%`, 20, 90);
   doc.text(`Status: ${defaulter?"Defaulter":"OK"}`, 20, 100);

   let y=120;
   records.forEach(r=>{
     doc.text(`${r.date} | ${r.name} | ${r.className} | ${r.batch} | ${r.subject}`, 20, y);
     y+=10;
   });

   const pdfBuffer = doc.output("arraybuffer");
   res.header("Content-Type","application/pdf");
   res.attachment(`${student||subject||cls||batch||"report"}.pdf`);
   return res.send(Buffer.from(pdfBuffer));
 }

 // Default HTML view
 let html=`
 <h1>📑 Report</h1>
 <p><b>Student:</b> ${student||"All"}</p>
 <p><b>Subject:</b> ${subject||"All"}</p>
 <p><b>Class:</b> ${cls||"All"}</p>
 <p><b>Batch:</b> ${batch||"All"}</p>
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
 <a href="/report?${student?`student=${student}&`:''}${subject?`subject=${subject}&`:''}${cls?`class=${cls}&`:''}${batch?`batch=${batch}&`:''}format=pdf">⬇ Download PDF</a><br>
 <a href="/report?${student?`student=${student}&`:''}${subject?`subject=${subject}&`:''}${cls?`class=${cls}&`:''}${batch?`batch=${batch}&`:''}format=csv">⬇ Download CSV</a>
 `;
 res.send(html);
});
/* =========================
   START SERVER
========================= */
app.listen(PORT,()=>console.log("🚀 Server running on port "+PORT));

