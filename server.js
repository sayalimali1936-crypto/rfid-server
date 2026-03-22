const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* ================= SAFE FILE HANDLER ================= */
function safeLoadCSV(file){
 try{
  const p = path.join(__dirname,file);
  if(!fs.existsSync(p)) return [];
  const data = fs.readFileSync(p,"utf8");
  const lines = data.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");

  return lines.map(line=>{
   let obj={};
   line.split(",").forEach((v,i)=>obj[headers[i]] = v.trim());
   return obj;
  });
 }catch(e){
  console.log("CSV LOAD ERROR:",file);
  return [];
 }
}

/* ================= DATABASE ================= */
const dbPath = path.join(__dirname,"attendance.db");
const csvPath = path.join(__dirname,"attendance.csv");

if (!fs.existsSync(csvPath)) {
 fs.writeFileSync(csvPath,"Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

const db = new sqlite3.Database(dbPath);

/* ================= LOAD CSV ================= */
const students = safeLoadCSV("Students.csv");
const staffMaster = safeLoadCSV("Staff_Master.csv");
const timetable = safeLoadCSV("Time_Table.csv");

/* ================= HELPERS ================= */
function normalize(v){ return v?.toString().trim().toUpperCase(); }

function identifyCard(cardNo){
 const student = students.find(s=>normalize(s.card_no)===normalize(cardNo));
 if(student) return {type:"STUDENT",data:student};

 const staff = staffMaster.find(s=>normalize(s.staff_card_no)===normalize(cardNo));
 if(staff) return {type:"STAFF",data:staff};

 return {type:"UNKNOWN",data:null};
}

/* ================= LOG ================= */
app.get("/log",(req,res)=>{
 try{
  const card=req.query.card_no;
  if(!card) return res.send("NO_CARD");

  const date=new Date().toISOString().slice(0,10);

  const csv=[date,"--","STUDENT","UNKNOWN",card,"--","--","--"].join(",")+"\n";
  fs.appendFileSync(csvPath,csv);

  res.send("OK");
 }catch(e){
  console.log(e);
  res.send("ERROR");
 }
});

/* ================= API ================= */
app.get("/api/data",(req,res)=>{
 try{
  const raw=fs.readFileSync(csvPath,"utf8").split(/\r?\n/).slice(1);

  let records=raw.map(l=>{
   let p=l.split(",");
   if(p.length<8) return null;
   return {name:p[3],className:p[5],subject:p[7]};
  }).filter(x=>x && x.name && x.name!=="UNKNOWN");

  let student={},subjectWise={},classWise={};

  records.forEach(r=>{
   student[r.name]=(student[r.name]||0)+1;
   subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
   classWise[r.className]=(classWise[r.className]||0)+1;
  });

  let totalLectures=records.length||1;

  let studentData={};
  Object.keys(student).forEach(n=>{
   let p=(student[n]/totalLectures)*100;
   studentData[n]={percent:p.toFixed(1),def:p<75};
  });

  res.json({totalLectures,studentData,subjectWise,classWise});

 }catch(e){
  console.log(e);
  res.json({totalLectures:0,studentData:{},subjectWise:{},classWise:{}});
 }
});

/* ================= UI ================= */
function viewPage(title){
return `
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body style="background:#0f172a;color:white;font-family:Segoe UI">

<h2>${title}</h2>

<canvas id="c"></canvas>

<script>
fetch("/api/data")
.then(r=>r.json())
.then(d=>{
 let labels=Object.keys(d.subjectWise);
 let values=Object.values(d.subjectWise);

 new Chart(c,{
  type:"bar",
  data:{labels,datasets:[{data:values}]}
 });
});
</script>

</body>
</html>
`;
}

/* ================= ROUTES ================= */
app.get("/",(req,res)=>res.redirect("/home"));

app.get("/home",(req,res)=>{
res.send(`
<h1>Dashboard</h1>
<button onclick="location='/subject'">Subject</button>
<button onclick="location='/class'">Class</button>
<button onclick="location='/hod'">HOD</button>
`);
});

app.get("/subject",(req,res)=>res.send(viewPage("Subject")));
app.get("/class",(req,res)=>res.send(viewPage("Class")));
app.get("/hod",(req,res)=>res.send(viewPage("HOD")));

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));