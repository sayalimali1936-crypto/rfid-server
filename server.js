const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* ============================================================
   🔒 BACKEND SECTION (DO NOT MODIFY THIS PART)
============================================================ */

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
 fs.writeFileSync(csvPath,"Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= LOAD CSV ================= */
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
 const utc=new Date();
 const ist=new Date(utc.getTime()+19800000);
 const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 return {
  date:ist.toISOString().slice(0,10),
  time:ist.toTimeString().slice(0,5),
  day:days[ist.getDay()]
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
 if(id.type==="UNKNOWN") return res.send("UNKNOWN");

 const {date,time,day}=getIndianTime();
 const slot=getActiveSlot(day,time,id);
 if(!slot) return res.send("NO_SLOT");

 db.run(`INSERT INTO attendance (card_no) VALUES (?)`,[normalize(card)]);

 const csv=[date,time,id.type,
  id.data?.student_name || id.data?.staff_name,
  card,
  slot.class,
  id.data?.batch || slot.batch,
  slot.subject
 ].join(",")+"\n";

 fs.appendFileSync(csvPath,csv);
 res.send("OK");
});

/* ================= API ================= */
app.get("/api/dashboard",(req,res)=>{
 const data=fs.readFileSync(csvPath,"utf8").split("\n").slice(1);

 let records=data.map(l=>{
  let p=l.split(",");
  if(p.length<8) return null;
  return {date:p[0],name:p[3],className:p[5],subject:p[7]};
 }).filter(x=>x);

 let subjectWise={},studentWise={};

 records.forEach(r=>{
  subjectWise[r.subject]=(subjectWise[r.subject]||0)+1;
  studentWise[r.name]=(studentWise[r.name]||0)+1;
 });

 res.json({total:records.length,subjectWise,studentWise,records});
});

/* ============================================================
   🎨 UI SECTION (ONLY THIS PART GIVE TO ANTIGRAVITY)
============================================================ */

```javascript
app.get("/dashboard",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Enterprise RFID Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<style>
:root {
  --bg-main: #0b0f19;
  --sidebar-bg: rgba(15, 23, 42, 0.6);
  --card-bg: rgba(30, 41, 59, 0.7);
  --glass-border: rgba(255, 255, 255, 0.08);
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --accent-1: #8b5cf6; 
  --accent-2: #06b6d4; 
  --danger: #f43f5e;
  --success: #10b981;
}

* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }

body { 
  background: radial-gradient(circle at top left, #1a1c2e, #0b0f19); 
  color: var(--text-main); 
  height: 100vh; 
  display: flex; 
  overflow: hidden; 
}

/* Layout */
.app-container { display: flex; width: 100%; height: 100%; }

/* Sidebar */
.sidebar { 
  width: 260px; 
  background: var(--sidebar-bg); 
  backdrop-filter: blur(16px); 
  border-right: 1px solid var(--glass-border); 
  display: flex; 
  flex-direction: column; 
  padding: 1.5rem; 
}

.brand { 
  font-size: 1.25rem; 
  font-weight: 700; 
  display: flex; 
  align-items: center; 
  gap: 0.5rem; 
  margin-bottom: 2.5rem; 
  background: linear-gradient(to right, var(--accent-1), var(--accent-2)); 
  -webkit-background-clip: text; 
  -webkit-text-fill-color: transparent; 
}

.form-group { margin-bottom: 1.5rem; }
.form-label { 
  font-size: 0.75rem; 
  text-transform: uppercase; 
  letter-spacing: 0.05em; 
  color: var(--text-muted); 
  margin-bottom: 0.5rem; 
  display: block; 
}

.select-input, .text-input { 
  width: 100%; 
  background: rgba(0, 0, 0, 0.2); 
  border: 1px solid var(--glass-border); 
  color: #fff; 
  padding: 0.75rem; 
  border-radius: 0.5rem; 
  outline: none; 
  transition: 0.3s; 
}

.select-input:focus, .text-input:focus { 
  border-color: var(--accent-1); 
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2); 
}

.nav-menu { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
.nav-item { 
  padding: 0.875rem 1rem; 
  border-radius: 0.75rem; 
  cursor: pointer; 
  transition: all 0.3s ease; 
  color: var(--text-muted); 
  font-weight: 500; 
  display: flex; 
  align-items: center; 
  gap: 0.75rem; 
}

.nav-item:hover { 
  background: rgba(255, 255, 255, 0.05); 
  color: var(--text-main); 
  transform: translateX(4px); 
}

.nav-item.active { 
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.15), transparent); 
  color: var(--accent-1); 
  border-left: 3px solid var(--accent-1); 
}

/* Main Content */
.main-content { 
  flex: 1; 
  padding: 2rem 3rem; 
  overflow-y: auto; 
}

.header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 2rem; 
}

.view-title { font-size: 1.75rem; font-weight: 600; }

/* Sections */
.view-section { display: none; animation: fadeIn 0.4s ease forwards; }
.view-section.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* Cards & Grids */
.kpi-grid { 
  display: grid; 
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); 
  gap: 1.5rem; 
  margin-bottom: 2rem; 
}

.card { 
  background: var(--card-bg); 
  backdrop-filter: blur(12px); 
  border: 1px solid var(--glass-border); 
  border-radius: 1rem; 
  padding: 1.5rem; 
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); 
  transition: transform 0.3s; 
}

.card:hover { 
  transform: translateY(-4px); 
  border-color: rgba(255,255,255,0.15); 
}

.card-title { 
  color: var(--text-muted); 
  font-size: 0.875rem; 
  font-weight: 500; 
  margin-bottom: 0.75rem; 
  display: flex; 
  align-items: center; 
  gap: 0.5rem; 
}

.card-value { font-size: 2rem; font-weight: 700; color: #fff; }
.chart-container { height: 350px; width: 100%; position: relative; }

/* Dept Grid */
.dept-grid { 
  display: grid; 
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
  gap: 1.5rem; 
}

.dept-card { 
  cursor: pointer; 
  text-align: center; 
  padding: 2.5rem 2rem; 
  position: relative; 
  overflow: hidden; 
}

.dept-card::before { 
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; 
  background: linear-gradient(to right, var(--accent-1), var(--accent-2)); 
  opacity: 0; transition: 0.3s; 
}

.dept-card:hover::before { opacity: 1; }
.dept-icon { font-size: 2.5rem; margin-bottom: 1.5rem; }

/* Tables */
.table-container { overflow-x: auto; margin-top: 1rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 1rem; text-align: left; border-bottom: 1px solid var(--glass-border); }
th { color: var(--text-muted); font-weight: 500; font-size: 0.875rem; text-transform: uppercase; }
tr:hover td { background: rgba(255, 255, 255, 0.02); }

.status-badge { 
  padding: 0.25rem 0.75rem; 
  border-radius: 1rem; 
  font-size: 0.75rem; 
  font-weight: 600; 
}
.danger { background: rgba(244, 63, 94, 0.1); color: var(--danger); }
.success { background: rgba(16, 185, 129, 0.1); color: var(--success); }

/* Scrollbar */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
</style>
</head>
<body>

<div class="app-container">
  
  <aside class="sidebar">
    <div class="brand">📊 DataSync BI</div>
    
    <div class="form-group">
      <label class="form-label">Active Class</label>
      <select class="select-input">
        <option value="se">Second Year (SE)</option>
        <option value="te">Third Year (TE)</option>
        <option value="be">Final Year (BE)</option>
      </select>
    </div>

    <nav class="nav-menu">
      <div class="nav-item active" onclick="switchView('dashboard', this)">
        <span>📈</span> Dashboard
      </div>
      <div class="nav-item" onclick="switchView('faculty', this)">
        <span>👨‍🏫</span> Faculty View
      </div>
      <div class="nav-item" onclick="switchView('hod', this)">
        <span>🏢</span> HOD View
      </div>
      <div class="nav-item" onclick="switchView('principal', this)">
        <span>🏛️</span> Principal View
      </div>
    </nav>
  </aside>

  <main class="main-content">
    
    <!-- DASHBOARD VIEW -->
    <div id="dashboard" class="view-section active">
      <div class="header">
        <h1 class="view-title">Overview Statistics</h1>
      </div>
      
      <div class="kpi-grid">
        <div class="card">
          <div class="card-title">🟢 Total Present</div>
          <div class="card-value"><span id="total">0</span></div>
        </div>
        <div class="card">
          <div class="card-title">🔴 Total Absent</div>
          <div class="card-value">24</div>
        </div>
        <div class="card">
          <div class="card-title">〽️ % Attendance</div>
          <div class="card-value">82%</div>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <div class="card-title">📊 Subject-wise Attendance</div>
          <div class="chart-container">
            <canvas id="chart"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- FACULTY VIEW -->
    <div id="faculty" class="view-section">
      <div class="header">
        <h1 class="view-title">Faculty Portal</h1>
        <input type="text" class="text-input" placeholder="🔍 Search students..." style="width: 300px;">
      </div>
      
      <div class="kpi-grid">
        <div class="card"><div class="card-title">Present Today</div><div class="card-value">64</div></div>
        <div class="card"><div class="card-title">Assigned Students</div><div class="card-value">75</div></div>
        <div class="card"><div class="card-title">Course Average</div><div class="card-value">85%</div></div>
      </div>

      <div class="card">
        <div class="card-title">📋 Detailed Class Report</div>
        <div class="table-container">
          <table>
            <thead><tr><th>Subject</th><th>Present</th><th>Absent</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Advanced Algorithms</td><td>60</td><td>15</td><td><span class="status-badge success">Optimal</span></td></tr>
              <tr><td>Operating Systems</td><td>42</td><td>33</td><td><span class="status-badge danger">Defaulters</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- HOD VIEW -->
    <div id="hod" class="view-section">
      <div class="header">
        <h1 class="view-title">Department Metrics</h1>
        <div style="display: flex; gap: 1rem; width: 400px;">
          <select class="select-input"><option>All Classes</option><option>SE</option><option>TE</option><option>BE</option></select>
          <select class="select-input"><option>All Subjects</option></select>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="card"><div class="card-title">Dept. Present</div><div class="card-value">340</div></div>
        <div class="card"><div class="card-title">Dept. Total</div><div class="card-value">410</div></div>
        <div class="card"><div class="card-title">Overall Health</div><div class="card-value">82.9%</div></div>
      </div>

      <div class="card">
        <div class="card-title">📋 Subject Monitoring</div>
        <div class="table-container">
          <table>
            <thead><tr><th>Year</th><th>Subject</th><th>Attendance Rate</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>SE</td><td>Data Structures</td><td>88%</td><td><span class="status-badge success">Healthy</span></td></tr>
              <tr><td>TE</td><td>Computer Networks</td><td>65%</td><td><span class="status-badge danger">Attention Required</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PRINCIPAL VIEW -->
    <div id="principal" class="view-section">
      <div class="header">
        <h1 class="view-title">Institute Analytics</h1>
      </div>

      <div class="dept-grid">
        <div class="card dept-card" onclick="goToHod()">
          <div class="dept-icon">💻</div><h3>Computer Engg</h3>
        </div>
        <div class="card dept-card" onclick="goToHod()">
          <div class="dept-icon">⚡</div><h3>Electrical Engg</h3>
        </div>
        <div class="card dept-card" onclick="goToHod()">
          <div class="dept-icon">🏗️</div><h3>Civil Engg</h3>
        </div>
        <div class="card dept-card" onclick="goToHod()">
          <div class="dept-icon">⚙️</div><h3>Mechanical Engg</h3>
        </div>
        <div class="card dept-card" onclick="goToHod()">
          <div class="dept-icon">📡</div><h3>ENTC</h3>
        </div>
        <div class="card dept-card" onclick="goToHod()">
          <div class="dept-icon">🎓</div><h3>First Year</h3>
        </div>
      </div>
    </div>

  </main>
</div>

<script>
// UI Navigation Logic
function switchView(viewId, element) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  document.getElementById(viewId).classList.add('active');
  if (element) {
    element.classList.add('active');
  }
}

function goToHod() {
  switchView('hod', document.querySelectorAll('.nav-item')[2]);
}

// Core Data Logic
let chart;

async function loadData() {
  const res = await fetch("/api/dashboard");
  const data = await res.json();

  document.getElementById("total").innerText = data.total;

  if(chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "bar",
    data: {
      labels: Object.keys(data.subjectWise),
      datasets: [{
        label: "Attendance",
        data: Object.values(data.subjectWise),
        backgroundColor: "#8b5cf6",
        borderRadius: 6,
        borderWidth: 0,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          beginAtZero: true, 
          grid: { color: "rgba(255,255,255,0.05)" }, 
          ticks: { color: "#94a3b8" } 
        },
        x: { 
          grid: { display: false }, 
          ticks: { color: "#94a3b8" } 
        }
      }
    }
  });
}

loadData();
</script>

</body>
</html>
`);
});
```
/* ================= START ================= */
app.get("/",(req,res)=>res.redirect("/dashboard"));

app.listen(PORT,()=>console.log("🚀 Server running"));