const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE SETUP
========================= */

const dbPath = path.join(__dirname, "attendance.db");
const csvPath = path.join(__dirname, "attendance.csv");

const db = new sqlite3.Database(dbPath, err => {
  if (err) console.error("❌ DB ERROR:", err.message);
  else console.log("✅ Database connected");
});

db.run(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(
    csvPath,
    "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n"
  );
  console.log("📄 attendance.csv created");
}

/* =========================
   LOAD CSV FILES
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

console.log("📚 CSV Loaded:", {
  students: students.length,
  staff: staffMaster.length,
  timetable: timetable.length
});

/* =========================
   HELPERS
========================= */

function normalize(v) {
  return v?.toString().trim().toUpperCase();
}

/* 🔑 TIME FIX — CORE FIX */
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function identifyCard(cardNo) {
  const student = students.find(
    s => normalize(s.card_no) === normalize(cardNo)
  );
  if (student) return { type: "STUDENT", data: student };

  const staff = staffMaster.find(
    s => normalize(s.staff_card_no) === normalize(cardNo)
  );
  if (staff) return { type: "STAFF", data: staff };

  return { type: "UNKNOWN", data: null };
}

function getIndianTime() {
  const utc = new Date();
  const ist = new Date(utc.getTime() + (5.5 * 60 * 60 * 1000));
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return {
    date: ist.toISOString().slice(0, 10),
    time: ist.toTimeString().slice(0, 5), // HH:MM
    day: days[ist.getDay()],
    hour: ist.getHours()
  };
}

/* ✅ FIXED ACTIVE SLOT LOGIC */
function getActiveSlot(day, time, identity) {
  const nowMin = timeToMinutes(time);

  return timetable.find(slot => {
    if (normalize(slot.day) !== normalize(day)) return false;

    const startMin = timeToMinutes(slot.start_time.slice(0,5));
    const endMin = timeToMinutes(slot.end_time.slice(0,5));

    if (nowMin < startMin || nowMin > endMin) return false;

    if (identity.type === "STUDENT") {
      return (
        normalize(slot.class) === normalize(identity.data.class) &&
        (
          normalize(slot.batch) === normalize(identity.data.batch) ||
          normalize(slot.batch) === "ALL"
        )
      );
    }

    if (identity.type === "STAFF") {
      return normalize(slot.staff_id) === normalize(identity.data.staff_id);
    }

    return false;
  });
}

/* =========================
   DAILY REPORT (4 PM IST)
========================= */

function generateDailyReportIfNeeded() {
  const { date, hour } = getIndianTime();
  if (hour < 16) return;

  const reportFile = `attendance_${date}.csv`;
  const reportPath = path.join(__dirname, reportFile);

  if (!fs.existsSync(reportPath)) {
    fs.copyFileSync(csvPath, reportPath);
    console.log(`📁 DAILY REPORT GENERATED: ${reportFile}`);
  }
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("RFID Attendance Server Running");
});

app.get("/log", (req, res) => {
  generateDailyReportIfNeeded();

  const cardNo = req.query.card_no;
  console.log("\n🔔 SCAN REQUEST RECEIVED");
  console.log("🆔 Card No:", cardNo);

  if (!cardNo) {
    console.log("❌ REJECTED: No card number");
    return res.send("NO_CARD");
  }

  const identity = identifyCard(cardNo);

  if (identity.type === "UNKNOWN") {
    console.log("❌ REJECTED: Unknown card");
    return res.send("UNKNOWN_CARD");
  }

  console.log("👤 Type:", identity.type);
  console.log("📛 Name:",
    identity.type === "STUDENT"
      ? identity.data.student_name
      : identity.data.staff_name
  );

  const { date, time, day } = getIndianTime();
  console.log("🕒 Time:", day, time);

  const slot = getActiveSlot(day, time, identity);

  if (!slot) {
    console.log("❌ REJECTED: No active timetable slot");
    return res.send("NO_SLOT");
  }

  console.log("📘 Subject:", slot.subject);
  console.log("🏫 Class:", slot.class);
  console.log("👥 Batch:",
    identity.type === "STUDENT"
      ? identity.data.batch
      : slot.batch
  );

  /* PROXY PREVENTION (10 min) */
  db.get(
    `SELECT timestamp FROM attendance WHERE card_no=? ORDER BY timestamp DESC LIMIT 1`,
    [normalize(cardNo)],
    (err, row) => {
      if (row) {
        const diff = (new Date() - new Date(row.timestamp)) / 1000;
        if (diff < 600) {
          console.log("🚫 REJECTED: Duplicate scan");
          return res.send("DUPLICATE");
        }
      }

      db.run(`INSERT INTO attendance (card_no) VALUES (?)`, [normalize(cardNo)]);

      const csvLine = [
        date,
        time,
        identity.type,
        identity.type === "STUDENT"
          ? identity.data.student_name
          : identity.data.staff_name,
        normalize(cardNo),
        slot.class,
        identity.type === "STUDENT"
          ? identity.data.batch
          : slot.batch,
        slot.subject
      ].join(",") + "\n";

      fs.appendFile(csvPath, csvLine, () => {});

      console.log("✅ ATTENDANCE LOGGED SUCCESSFULLY");
      res.send("OK");
    }
  );
});

app.get("/download", (req, res) => {
  res.download(csvPath, "attendance.csv");
});

app.get("/download/today", (req, res) => {
  const { date } = getIndianTime();
  const file = `attendance_${date}.csv`;
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    return res.send("Daily report not generated yet");
  }

  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});|
/* =========================
   DASHBOARD API
========================= */

app.get("/api/dashboard", (req, res) => {
  const data = fs.readFileSync(csvPath, "utf8");
  const lines = data.trim().split("\n").slice(1);

  let records = lines.map(line => {
    const [date,time,role,name,card,className,batch,subject] = line.split(",");
    return { date,time,role,name,card,className,batch,subject };
  });

  const { classFilter, subjectFilter, dateFilter } = req.query;

  if (classFilter) records = records.filter(r => r.className === classFilter);
  if (subjectFilter) records = records.filter(r => r.subject === subjectFilter);
  if (dateFilter) records = records.filter(r => r.date === dateFilter);

  let subjectWise = {};
  let studentWise = {};

  records.forEach(r => {
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
    studentWise[r.name] = (studentWise[r.name] || 0) + 1;
  });

  let defaulters = Object.entries(studentWise)
    .filter(([name, count]) => count < 3)
    .map(([name]) => name);

  res.json({
    total: records.length,
    subjectWise,
    studentWise,
    defaulters,
    records
  });
});


/* =========================
   WEB DASHBOARD
========================= */

app.get("/dashboard", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Smart RFID Attendance Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    :root {
      --bg-dark: #0f172a;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-color: #334155;
      --danger: #ef4444;
      --success: #22c55e;
      --transition: all 0.3s ease;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif; }
    
    body { background-color: var(--bg-dark); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar { width: 260px; background-color: var(--bg-card); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; padding: 30px 0; transition: var(--transition); z-index: 10; }
    .logo-container { padding: 0 24px 30px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; display: flex; align-items: center; gap: 12px; font-size: 1.25rem; font-weight: 700; color: white; }
    .logo-icon { width: 32px; height: 32px; background: var(--primary); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
    
    .nav-item { padding: 14px 24px; margin: 4px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-weight: 500; transition: var(--transition); position: relative; overflow: hidden; }
    .nav-item:hover { background-color: var(--bg-hover); color: white; }
    .nav-item.active { background-color: rgba(59, 130, 246, 0.1); color: var(--primary); }
    .nav-item.active::before { content: ""; position: absolute; left: 0; top: 0; height: 100%; width: 4px; background: var(--primary); border-radius: 0 4px 4px 0; }
    
    .sidebar-footer { margin-top: auto; padding: 24px; border-top: 1px solid var(--border-color); }
    .custom-select { width: 100%; background: var(--bg-dark); color: var(--text-main); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; outline: none; transition: var(--transition); appearance: none; cursor: pointer; }
    .custom-select:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }

    /* Main Content */
    .main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background-color: var(--bg-dark); }
    
    .topbar { height: 80px; background-color: rgba(30, 41, 59, 0.8); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; padding: 0 40px; justify-content: space-between; position: sticky; top: 0; z-index: 5; }
    .page-title { font-size: 1.5rem; font-weight: 600; color: white; }
    
    .container { padding: 40px; }

    /* Views */
    .view-section { display: none; animation: fadeIn 0.4s ease-in-out; }
    .view-section.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    /* Cards */
    .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin-bottom: 32px; }
    
    .stat-card { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); transition: var(--transition); position: relative; overflow: hidden; }
    .stat-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -8px rgba(0, 0, 0, 0.4); border-color: var(--bg-hover); }
    .stat-card::after { content: ""; position: absolute; top:0; right:0; width: 100px; height: 100px; background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%); border-radius: 50%; transform: translate(30%, -30%); }
    
    .stat-title { color: var(--text-muted); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 12px; }
    .stat-value { font-size: 2.25rem; font-weight: 700; color: white; display: flex; align-items: baseline; gap: 8px; }

    /* Chart Box */
    .chart-box { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); height: 420px; width: 100%; position: relative; }

    /* Table */
    .table-container { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); }
    .table-header-controls { padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.1); }
    .search-input { background: var(--bg-dark) url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat 12px center; padding: 12px 16px 12px 40px; border: 1px solid var(--border-color); border-radius: 8px; color: white; width: 320px; outline: none; transition: var(--transition); }
    .search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
    
    table { width: 100%; border-collapse: collapse; }
    th { background: rgba(0,0,0,0.15); color: var(--text-muted); font-weight: 600; text-align: left; padding: 16px 24px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border-color); }
    td { padding: 16px 24px; border-bottom: 1px solid var(--border-color); color: var(--text-main); font-size: 0.9rem; }
    tbody tr { transition: var(--transition); }
    tbody tr:hover { background-color: rgba(255,255,255,0.03); }
    td:first-child { font-weight: 500; color: white; }

    .badge { padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.2); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }

    .btn { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: var(--transition); }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-dark); }
    ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
  </style>
</head>
<body>

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="logo-container">
      <div class="logo-icon">📶</div>
      <div>Smart RFID</div>
    </div>
    
    <div class="nav-item active" onclick="switchTab('dashboard')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="16" width="7" height="5" rx="1"></rect></svg>
      Dashboard
    </div>
    <div class="nav-item" onclick="switchTab('faculty')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      Faculty
    </div>
    <div class="nav-item" onclick="switchTab('hod')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      HOD
    </div>
    <div class="nav-item" onclick="switchTab('principal')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
      Principal
    </div>
    
    <div class="sidebar-footer">
      <label style="color:var(--text-muted); font-size:12px; text-transform:uppercase; font-weight:600; margin-bottom:8px; display:block;">Global Class</label>
      <select id="global-class" class="custom-select" onchange="renderCurrentView()">
        <option value="">All Classes</option>
        <option value="FE">First Year (FE)</option>
        <option value="SE">Second Year (SE)</option>
        <option value="TE">Third Year (TE)</option>
        <option value="BE">Final Year (BE)</option>
      </select>
    </div>
  </aside>
  
  <main class="main-content">
    <header class="topbar">
       <div id="page-title" class="page-title">Dashboard Overview</div>
       <div>
         <button class="btn" onclick="init()">Refresh Data</button>
       </div>
    </header>
    
    <div class="container">
      
      <!-- DASHBOARD VIEW -->
      <section id="view-dashboard" class="view-section active">
        <div class="grid-cards">
          <div class="stat-card">
            <div class="stat-title">Total Present Today</div>
            <div class="stat-value" id="dash-present">...</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Total Absent Today</div>
            <div class="stat-value" id="dash-absent">...</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Today's Attendance</div>
            <div class="stat-value" id="dash-pct">...</div>
          </div>
        </div>
        <div class="chart-box">
          <canvas id="mainChart"></canvas>
        </div>
      </section>
      
      <!-- FACULTY VIEW -->
      <section id="view-faculty" class="view-section">
        <div class="grid-cards">
          <div class="stat-card"><div class="stat-title">Total Lectures Conducted</div><div class="stat-value" id="fac-lectures">0</div></div>
          <div class="stat-card"><div class="stat-title">Average Attendance</div><div class="stat-value" id="fac-pct">0%</div></div>
        </div>
        <div class="table-container">
          <div class="table-header-controls">
            <input type="text" id="fac-search" class="search-input" placeholder="Search student by name..." onkeyup="renderFacultyTable()">
          </div>
          <table>
            <thead><tr><th>Student Name</th><th>Subject</th><th>Attendance Progress</th><th>Status</th></tr></thead>
            <tbody id="fac-tbody"></tbody>
          </table>
        </div>
      </section>
      
      <!-- HOD VIEW -->
      <section id="view-hod" class="view-section">
        <div style="display:flex; gap:24px; margin-bottom:32px;">
          <select id="hod-class" class="custom-select" style="width:240px" onchange="updateHodSubjects(); renderHodView();">
            <option value="">All Classes (HOD)</option>
            <option value="FE">First Year (FE)</option>
            <option value="SE">Second Year (SE)</option>
            <option value="TE">Third Year (TE)</option>
            <option value="BE">Final Year (BE)</option>
          </select>
          <select id="hod-subject" class="custom-select" style="width:240px" onchange="renderHodView()">
            <option value="">All Subjects</option>
          </select>
        </div>
        <div class="grid-cards">
          <div class="stat-card"><div class="stat-title">Total Students</div><div class="stat-value" id="hod-total">0</div></div>
          <div class="stat-card"><div class="stat-title">Present Today</div><div class="stat-value" id="hod-present">0</div></div>
          <div class="stat-card"><div class="stat-title">Overall Class %</div><div class="stat-value" id="hod-pct">0%</div></div>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>Subject</th><th>Lectures Conducted</th><th>Avg Students Present</th></tr></thead>
            <tbody id="hod-tbody"></tbody>
          </table>
        </div>
      </section>
      
      <!-- PRINCIPAL VIEW -->
      <section id="view-principal" class="view-section">
        <div class="grid-cards" id="dept-cards">
          <!-- Rendered in JS -->
        </div>
      </section>

    </div>
  </main>

  <script>
    let rawRecords = [];
    let validRecords = []; 
    let subjectLectures = {}; 
    let totalStudents = 0;
    let studentSubjectCount = {}; 
    let dashboardChart;

    async function init() {
      try {
        const res = await fetch("/api/dashboard");
        const data = await res.json();
        rawRecords = data.records || [];
        processData();
        renderCurrentView();
      } catch(err) {
        console.error("Error fetching data:", err);
      }
    }

    function processData() {
      const uniqueStudentAtt = new Map();
      const studentClasses = {}; 

      rawRecords.forEach(r => {
        if (r.role === 'STUDENT') {
          const key = \`\${r.date}-\${r.subject}-\${r.name}\`;
          if (!uniqueStudentAtt.has(key)) {
            uniqueStudentAtt.set(key, r);
          }
          studentClasses[r.name] = r.className;
        }
      });
      validRecords = Array.from(uniqueStudentAtt.values());
      totalStudents = Object.keys(studentClasses).length || 1;

      const subjectDateMap = {}; 
      validRecords.forEach(r => {
        if (!subjectDateMap[r.subject]) subjectDateMap[r.subject] = new Set();
        subjectDateMap[r.subject].add(r.date);
      });
      for (const sub in subjectDateMap) {
        subjectLectures[sub] = subjectDateMap[sub].size || 1;
      }

      studentSubjectCount = {};
      validRecords.forEach(r => {
        if (!studentSubjectCount[r.name]) studentSubjectCount[r.name] = {};
        studentSubjectCount[r.name][r.subject] = (studentSubjectCount[r.name][r.subject] || 0) + 1;
        studentSubjectCount[r.name]._class = r.className;
      });
    }

    function getFilteredRecords() {
      const gClass = document.getElementById("global-class").value;
      return validRecords.filter(r => !gClass || r.className === gClass);
    }

    function renderDashboard() {
      const records = getFilteredRecords();
      const dates = [...new Set(records.map(r => r.date))].sort();
      const latestDate = dates.length ? dates[dates.length - 1] : null;

      let presentToday = 0;
      let totalStuds = new Set(records.map(r=>r.name)).size || (getFilteredRecords().length ? 1 : 0);

      if (latestDate) {
        const todayRecs = records.filter(r => r.date === latestDate);
        presentToday = new Set(todayRecs.map(r => r.name)).size;
      }

      const absentToday = totalStuds > presentToday ? totalStuds - presentToday : 0;
      let pct = totalStuds > 0 ? ((presentToday / totalStuds) * 100).toFixed(1) : 0;

      document.getElementById("dash-present").innerText = presentToday;
      document.getElementById("dash-absent").innerText = absentToday;
      document.getElementById("dash-pct").innerText = pct + "%";

      const subPresences = {};
      records.forEach(r => {
        subPresences[r.subject] = (subPresences[r.subject] || 0) + 1;
      });

      const ctx = document.getElementById("mainChart").getContext("2d");
      if (dashboardChart) dashboardChart.destroy();
      
      Chart.defaults.color = '#94a3b8';
      Chart.defaults.borderColor = '#334155';
      Chart.defaults.font.family = 'Inter';

      dashboardChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: Object.keys(subPresences),
          datasets: [{
            label: 'Total Subject Presences',
            data: Object.values(subPresences),
            backgroundColor: '#3b82f6',
            hoverBackgroundColor: '#60a5fa',
            borderRadius: 6,
            barThickness: 40
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#1e293b' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    function renderFacultyTable() {
      const gClass = document.getElementById("global-class").value;
      const search = document.getElementById("fac-search").value.toLowerCase();
      const tbody = document.getElementById("fac-tbody");
      tbody.innerHTML = "";

      let totalLec = 0;
      let attendedLecSum = 0;
      let pairCount = 0;
      let lecSet = new Set();
      
      let rows = "";
      
      for (const student in studentSubjectCount) {
        const dataInfo = studentSubjectCount[student];
        if (gClass && dataInfo._class !== gClass) continue;
        if (search && !student.toLowerCase().includes(search)) continue;

        for (const subject in dataInfo) {
          if (subject === '_class') continue;
          const att = dataInfo[subject];
          const maxLec = subjectLectures[subject] || 1;
          let pct = (att / maxLec) * 100;
          if (pct > 100) pct = 100;

          lecSet.add(subject);
          totalLec += maxLec;
          attendedLecSum += att;
          pairCount++;

          rows += \`
            <tr>
              <td>\${student}</td>
              <td>\${subject}</td>
              <td>
                <div style="display:flex; align-items:center; gap:12px;">
                  <div style="flex:1; background:rgba(0,0,0,0.2); height:8px; border-radius:4px; overflow:hidden;">
                    <div style="width:\${pct}%; background:\${pct>=75 ? '#22c55e' : '#ef4444'}; height:100%; border-radius:4px; transition:width 1s ease-out;"></div>
                  </div>
                  <span style="width:45px; text-align:right; font-weight:600; color:\${pct>=75 ? '#22c55e' : '#ef4444'};">\${pct.toFixed(0)}%</span>
                </div>
              </td>
              <td><span class="badge \${pct>=75 ? 'badge-success' : 'badge-danger'}">\${pct>=75 ? 'Optimal' : 'Defaulter'}</span></td>
            </tr>
          \`;
        }
      }

      tbody.innerHTML = rows;

      let uniqueSubLecs = Array.from(lecSet).reduce((sum, sub) => sum + (subjectLectures[sub]||1), 0);
      document.getElementById("fac-lectures").innerText = uniqueSubLecs;
      let avgPct = pairCount === 0 ? 0 : (attendedLecSum / totalLec) * 100;
      document.getElementById("fac-pct").innerText = avgPct.toFixed(1) + "%";
    }

    function updateHodSubjects() {
      const hClass = document.getElementById("hod-class").value;
      const hSub = document.getElementById("hod-subject");
      hSub.innerHTML = '<option value="">All Subjects</option>';
      
      const subjectsForClass = new Set();
      validRecords.forEach(r => {
        if (!hClass || r.className === hClass) subjectsForClass.add(r.subject);
      });
      
      subjectsForClass.forEach(s => {
        hSub.innerHTML += \`<option value="\${s}">\${s}</option>\`;
      });
    }

    function renderHodView() {
      const hClass = document.getElementById("hod-class").value;
      const hSub = document.getElementById("hod-subject").value;
      
      let filtered = validRecords;
      if (hClass) filtered = filtered.filter(r => r.className === hClass);
      if (hSub) filtered = filtered.filter(r => r.subject === hSub);

      const dates = [...new Set(filtered.map(r=>r.date))].sort();
      const latestDate = dates.length ? dates[dates.length - 1] : null;
      const todayRecs = latestDate ? filtered.filter(r => r.date === latestDate) : [];
      
      const totalStudsForHod = new Set(filtered.map(r=>r.name)).size || (filtered.length ? 1 : 0);
      const presentToday = new Set(todayRecs.map(r=>r.name)).size;
      
      document.getElementById("hod-total").innerText = totalStudsForHod;
      document.getElementById("hod-present").innerText = presentToday;
      document.getElementById("hod-pct").innerText = totalStudsForHod > 0 ? ((presentToday/totalStudsForHod)*100).toFixed(1) + "%" : "0%";

      const tbody = document.getElementById("hod-tbody");
      const subStats = {};
      filtered.forEach(r => {
        if (!subStats[r.subject]) subStats[r.subject] = new Set();
        subStats[r.subject].add(r.name + r.date);
      });
      
      let rows = "";
      for (const sub in subStats) {
        const presences = subStats[sub].size;
        const lecs = subjectLectures[sub] || 1;
        const avgPresent = (presences / lecs).toFixed(1);
        
        rows += \`<tr>
          <td>\${sub}</td>
          <td>\${lecs}</td>
          <td>\${avgPresent} <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">Avg per lecture</span></td>
        </tr>\`;
      }
      tbody.innerHTML = rows;
    }

    function renderPrincipalView() {
      const depts = ["Computer", "Electrical", "Civil", "Mechanical", "ENTC", "First Year"];
      const container = document.getElementById("dept-cards");
      container.innerHTML = "";
      
      depts.forEach(d => {
        container.innerHTML += \`
          <div class="stat-card" style="cursor:pointer;" onclick="switchTab('hod')">
            <div class="stat-title">Department</div>
            <div class="stat-value" style="font-size:1.5rem; margin-bottom:15px;">\${d} Engg.</div>
            <div style="color:var(--primary); font-size:14px; font-weight:600; display:flex; align-items:center; gap:5px;">
              View Analytics <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 19 19"></polyline></svg>
            </div>
          </div>
        \`;
      });
    }

    function switchTab(viewName) {
      document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      
      const targetView = document.getElementById('view-' + viewName);
      if(targetView) targetView.classList.add('active');
      
      const navItems = document.querySelectorAll('.nav-item');
      for (let item of navItems) {
        if (item.innerText.toLowerCase().includes(viewName)) {
          item.classList.add('active');
        }
      }

      const titles = {
        'dashboard': 'Dashboard Overview',
        'faculty': 'Faculty Portal',
        'hod': 'HOD Overview',
        'principal': 'Principal View'
      };
      document.getElementById("page-title").innerText = titles[viewName];

      if (viewName === 'dashboard') renderDashboard();
      if (viewName === 'faculty') renderFacultyTable();
      if (viewName === 'hod') {
        updateHodSubjects();
        renderHodView();
      }
      if (viewName === 'principal') renderPrincipalView();
    }

    function renderCurrentView() {
      const activeViewEl = document.querySelector('.view-section.active');
      if (!activeViewEl) return switchTab('dashboard');
      const viewId = activeViewEl.id.replace('view-', '');
      switchTab(viewId);
    }

    document.addEventListener("DOMContentLoaded", () => {
      init();
    });
  </script>
</body>
</html>
  `);
});

