const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ================= DATABASE ================= */
const db = new sqlite3.Database("./attendance.db");

db.serialize(()=>{
 db.run(`CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  username TEXT,
  password TEXT,
  role TEXT
 )`);

 db.run(`CREATE TABLE IF NOT EXISTS attendance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  class TEXT,
  subject TEXT,
  date TEXT
 )`);

 /* DEFAULT USERS */
 db.run(`INSERT OR IGNORE INTO users VALUES (1,'teacher','1234','teacher')`);
 db.run(`INSERT OR IGNORE INTO users VALUES (2,'hod','1234','hod')`);
});

/* ================= LOGIN ================= */
app.post("/login",(req,res)=>{
 const {username,password}=req.body;

 db.get(
  "SELECT * FROM users WHERE username=? AND password=?",
  [username,password],
  (err,row)=>{
   if(row){
    res.json({success:true,role:row.role});
   }else{
    res.json({success:false});
   }
  }
 );
});

/* ================= RFID LOG ================= */
app.get("/log",(req,res)=>{
 const {name,className,subject}=req.query;

 const date=new Date().toISOString().slice(0,10);

 db.run(
  "INSERT INTO attendance(name,class,subject,date) VALUES(?,?,?,?)",
  [name||"Unknown",className||"NA",subject||"NA",date]
 );

 res.send("OK");
});

/* ================= DATA ENGINE ================= */
app.get("/api/data",(req,res)=>{

 db.all("SELECT * FROM attendance",(err,rows)=>{

  let student={},subject={},classWise={},todayMap={};
  let today=new Date().toISOString().slice(0,10);

  rows.forEach(r=>{
   student[r.name]=(student[r.name]||0)+1;
   subject[r.subject]=(subject[r.subject]||0)+1;
   classWise[r.class]=(classWise[r.class]||0)+1;

   if(r.date===today) todayMap[r.name]=true;
  });

  let totalLectures=rows.length||1;

  let studentData={};
  Object.keys(student).forEach(n=>{
   let p=(student[n]/totalLectures)*100;
   studentData[n]={
    percent:p.toFixed(1),
    def:p<75,
    today:todayMap[n]||false
   };
  });

  res.json({studentData,subject,classWise,totalLectures});
 });
});

/* ================= UI ================= */
app.get("/",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<style>
body{font-family:Segoe UI;text-align:center;background:#020617;color:white;padding-top:100px}
input{padding:10px;margin:10px}
button{padding:10px;background:#6366f1;color:white;border:none}
</style>
</head>

<body>

<h1>🔐 Login</h1>

<input id="user" placeholder="Username"><br>
<input id="pass" type="password" placeholder="Password"><br>

<button onclick="login()">Login</button>

<script>
async function login(){
 let u=user.value;
 let p=pass.value;

 let res=await fetch("/login",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({username:u,password:p})
 });

 let d=await res.json();

 if(d.success){
  location="/dashboard?role="+d.role;
 }else{
  alert("Invalid login");
 }
}
</script>

</body>
</html>
`);
});

/* ================= DASHBOARD ================= */
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{margin:0;display:flex;background:#020617;color:white;font-family:Segoe UI}
.sidebar{width:220px;background:#020617;padding:20px}
.sidebar button{width:100%;padding:10px;margin:5px;background:#1e293b;color:white;border:none}
.main{flex:1;padding:20px}
.cards{display:flex;gap:10px}
.card{flex:1;padding:20px;background:#1e293b;border-radius:10px;text-align:center}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px}
table{width:100%;margin-top:20px;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #334155}
.def{color:red}
.ok{color:lime}
</style>

</head>

<body>

<div class="sidebar">
<button onclick="load()">Refresh</button>
<button onclick="window.print()">Export PDF</button>
</div>

<div class="main">

<div class="cards">
<div class="card">Lectures <h2 id="lec"></h2></div>
<div class="card">Students <h2 id="stu"></h2></div>
<div class="card">Defaulters <h2 id="def"></h2></div>
</div>

<div class="grid">
<canvas id="bar"></canvas>
<canvas id="pie"></canvas>
</div>

<table>
<tr><th>Name</th><th>%</th><th>Today</th><th>Status</th></tr>
<tbody id="table"></tbody>
</table>

</div>

<script>

async function load(){

 let d=await fetch("/api/data").then(r=>r.json());

 lec.innerText=d.totalLectures;
 stu.innerText=Object.keys(d.studentData).length;
 def.innerText=Object.values(d.studentData).filter(x=>x.def).length;

 new Chart(bar,{
  type:"bar",
  data:{
   labels:Object.keys(d.subject),
   datasets:[{data:Object.values(d.subject)}]
  }
 });

 let t=document.getElementById("table");
 t.innerHTML="";

 Object.entries(d.studentData).forEach(([n,v])=>{
  t.innerHTML+=\`
  <tr>
  <td>\${n}</td>
  <td>\${v.percent}%</td>
  <td>\${v.today?'✔':'❌'}</td>
  <td class="\${v.def?'def':'ok'}">\${v.def?'OK':'Defaulter'}</td>
  </tr>\`;
 });
}

load();

</script>

</body>
</html>
`);
});

/* ================= START ================= */
app.listen(PORT,()=>console.log("🚀 Server running"));