const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE SETUP (UNCHANGED)
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
   LOAD CSV FILES (UNCHANGED)
========================= */

function loadCSV(file) {
  const data = fs.readFileSync(path.join(__dirname, file), "utf8");
  const lines = data.trim().split("\n");
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
   HELPERS (UNCHANGED)
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

function identifyCard(cardNo) {
  const student = students.find(s => normalize(s.card_no) === normalize(cardNo));
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(s => normalize(s.staff_card_no) === normalize(cardNo));
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN" };
}

function getIndianTime() {
  const d = new Date(new Date().getTime() + 19800000);
  return {
    date: d.toISOString().slice(0,10),
    time: d.toTimeString().slice(0,5)
  };
}

/* =========================
   RFID LOG (UNCHANGED)
========================= */

app.get("/log",(req,res)=>{
  const card=req.query.card_no;
  if(!card) return res.send("NO_CARD");

  const id=identifyCard(card);
  if(id.type==="UNKNOWN") return res.send("UNKNOWN");

  const {date,time}=getIndianTime();

  const csv=[date,time,id.type,
    id.data?.student_name||id.data?.staff_name,
    card,
    id.data?.class||"",
    id.data?.batch||"",
    "Subject"
  ].join(",")+"\n";

  fs.appendFile(csvPath,csv,()=>{});
  res.send("OK");
});

/* =========================
   LOGIN
========================= */

app.get("/login",(req,res)=>{
res.send(`
<h2 style="text-align:center">Login</h2>
<div style="text-align:center">
<select id="role">
<option value="teacher">Teacher</option>
<option value="hod">HOD</option>
</select><br><br>
<input id="pass" type="password"><br><br>
<button onclick="go()">Login</button>
</div>

<script>
function go(){
 if(document.getElementById("pass").value=="1234")
 location="/dashboard";
 else alert("Wrong");
}
</script>
`);
});

/* =========================
   ADVANCED API
========================= */

app.get("/api/dashboard",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records=data.map(l=>{
  let [d,t,r,n,c,cl,b,s]=l.split(",");
  return {d,n,cl,b,s};
 }).filter(x=>x.n);

 let student={},subject={},classWise={};

 records.forEach(r=>{
  student[r.n]=(student