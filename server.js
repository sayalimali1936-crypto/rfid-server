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
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

    const startMin = timeToMinutes(slot.start_time.slice(0, 5));
    const endMin = timeToMinutes(slot.end_time.slice(0, 5));

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

      fs.appendFile(csvPath, csvLine, () => { });

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
});
/* =========================
   DASHBOARD API
========================= */

app.get("/api/dashboard", (req, res) => {
  const data = fs.readFileSync(csvPath, "utf8");
  const lines = data.trim().split("\n").slice(1);

  let records = lines.map(line => {
    const [date, time, role, name, card, className, batch, subject] = line.split(",");
    return { date, time, role, name, card, className, batch, subject };
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
      --bg-dark: #121212;
      --bg-card: #1e1e1e;
      --bg-hover: #292929;
      --primary: #10b981;
      --primary-hover: #059669;
      --text-main: #f9fafb;
      --text-muted: #9ca3af;
      --border-color: #374151;
      --danger: #f43f5e;
      --success: #10b981;
      --transition: all 0.3s ease;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif; }
    
    body { background-color: var(--bg-dark); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-dark); }
    ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

    /* Sidebar */
    .sidebar { width: 260px; background-color: var(--bg-card); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; padding: 24px 0; transition: var(--transition); z-index: 10; }
    .logo-container { padding: 0 24px 24px; border-bottom: 1px solid var(--border-color); margin-bottom: 16px; display: flex; align-items: center; gap: 12px; font-size: 1.25rem; font-weight: 700; color: white; }
    .logo-icon { width: 32px; height: 32px; background: var(--primary); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
    
    .nav-item { padding: 12px 24px; margin: 4px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-weight: 500; transition: var(--transition); position: relative; }
    .nav-item:hover { background-color: var(--bg-hover); color: white; transform: translateX(8px); }
    .nav-item.active { background-color: rgba(59, 130, 246, 0.1); color: var(--primary); }
    .nav-item.active::before { content: ""; position: absolute; left: -16px; top: 0; height: 100%; width: 4px; background: var(--primary); border-radius: 0 4px 4px 0; }
    
    .sidebar-footer { margin-top: auto; padding: 24px; border-top: 1px solid var(--border-color); }
    .custom-select, .search-input { width: 100%; background: var(--bg-dark); color: var(--text-main); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; outline: none; transition: var(--transition); font-size: 0.9rem; }
    .custom-select:focus, .search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
    
    /* Main Content */
    .main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background-color: var(--bg-dark); }
    .topbar { height: 72px; background-color: rgba(30, 41, 59, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; padding: 0 32px; justify-content: space-between; position: sticky; top: 0; z-index: 5; }
    .page-title { font-size: 1.25rem; font-weight: 600; color: white; display: flex; align-items: center; gap: 8px; }
    .container { padding: 32px; }

    /* Views */
    .view-section { display: none; animation: fadeIn 0.4s ease; }
    .view-section.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    /* Cards */
    .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 24px; }
    .stat-card { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease; display: flex; flex-direction: column; gap: 8px; }
    .stat-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); border-color: var(--primary); }
    .stat-title { color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; display:flex; align-items:center; gap:6px;}
    .stat-value { font-size: 2rem; font-weight: 700; color: white; display: flex; align-items: baseline; gap: 8px; }

    /* Chart Box */
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 24px; }
    .chart-box { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); width: 100%; position:relative; }
    .chart-title { color: white; font-weight: 600; font-size: 1rem; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;}
    .chart-container { position: relative; height: 280px; width: 100%; }

    /* Filters Bar */
    .filters-bar { display: flex; gap: 16px; margin-bottom: 24px; background: var(--bg-card); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); align-items: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    
    /* Table */
    .table-container { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 24px;}
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: rgba(15, 23, 42, 0.5); color: var(--text-muted); font-weight: 600; padding: 14px 24px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border-color); }
    td { padding: 14px 24px; border-bottom: 1px solid var(--border-color); color: var(--text-main); font-size: 0.9rem; }
    tbody tr { transition: var(--transition); }
    tbody tr:hover { background-color: rgba(59, 130, 246, 0.05); }

    .badge { padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.2); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }

    /* Dept Cards */
    .dept-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
    .dept-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 32px 24px; text-align: center; cursor: pointer; transition: transform 0.3s ease, border-color 0.3s ease; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .dept-card:hover { transform: translateY(-6px); border-color: var(--primary); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
    .dept-icon { font-size: 2.5rem; }
    .dept-title { font-size: 1.1rem; font-weight: 600; color: white; }

  </style>
</head>
<body>

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="logo-container">
       <div class="logo-icon">📊</div>
       <div>Admin Panel</div>
    </div>
    
    <div class="nav-item" onclick="switchTab('principal')">
       <span style="font-size:1.1rem;">🏛</span> Principal
    </div>
    <div class="nav-item active" onclick="switchTab('dashboard')">
       <span style="font-size:1.1rem;">📊</span> Dashboard
    </div>
    <div class="nav-item" onclick="switchTab('faculty')">
       <span style="font-size:1.1rem;">👨‍🏫</span> Faculty
    </div>
    <div class="nav-item" onclick="switchTab('hod')">
       <span style="font-size:1.1rem;">🏫</span> HOD
    </div>
    
    <div class="sidebar-footer">
       <label style="color:var(--text-muted); font-size:11px; text-transform:uppercase; font-weight:600; margin-bottom:8px; display:block;">Context Scope (Class)</label>
       <select id="global-class" class="custom-select" onchange="renderCurrentView()">
          <option value="">All Classes</option>
          <option value="FE">FE (First Year)</option>
          <option value="SE">SE (Second Year)</option>
          <option value="TE">TE (Third Year)</option>
          <option value="BE">BE (Final Year)</option>
       </select>
    </div>
  </aside>
  
  <main class="main-content">
    <header class="topbar">
       <div id="page-title" class="page-title">Dashboard Overview</div>
       <div style="font-size:0.85rem; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--success);"></span> Live Auto-Sync
       </div>
    </header>
    
    <div class="container">
      
      <!-- 1. DASHBOARD VIEW -->
      <section id="view-dashboard" class="view-section active">
        <div class="grid-cards">
          <div class="stat-card">
            <div class="stat-title">🟢 Total Present Today</div>
            <div class="stat-value" id="dash-present">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">🔴 Total Absent Today</div>
            <div class="stat-value" id="dash-absent">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">📊 Today's % Attendance</div>
            <div class="stat-value" id="dash-pct">0%</div>
          </div>
        </div>
        <div class="charts-grid">
           <div class="chart-box">
              <div class="chart-title">Subject vs Students Present (Today)</div>
              <div class="chart-container"><canvas id="dashBarChart"></canvas></div>
           </div>
           <div class="chart-box">
              <div class="chart-title">Weekly Attendance Trend</div>
              <div class="chart-container"><canvas id="dashLineChart"></canvas></div>
           </div>
        </div>
      </section>
      
      <!-- 2. FACULTY VIEW -->
      <section id="view-faculty" class="view-section">
        <div class="filters-bar">
          <input type="text" id="fac-search" class="search-input" style="flex:2;" placeholder="🔍 Search student name..." onkeyup="renderFacultyView()">
          <select id="fac-subject" class="custom-select" style="flex:1;" onchange="renderFacultyView()">
            <option value="">📘 All Subjects</option>
          </select>
        </div>
        <div class="grid-cards">
          <div class="stat-card">
             <div class="stat-title">Total Lectures Conducted</div>
             <div class="stat-value" id="fac-lec-total">0</div>
          </div>
          <div class="stat-card">
             <div class="stat-title">Student Attended Lectures</div>
             <div class="stat-value" id="fac-lec-attended">0</div>
          </div>
          <div class="stat-card">
             <div class="stat-title">% Attendance</div>
             <div class="stat-value" id="fac-att-pct">0%</div>
          </div>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>Name</th><th>Subject</th><th>Attendance %</th><th>Status</th></tr></thead>
            <tbody id="fac-tbody"></tbody>
          </table>
        </div>
        <div class="chart-box" style="margin-top: 24px;">
           <div class="chart-title" id="fac-chart-title">Subject-wise Attendance</div>
           <div class="chart-container" style="height: 300px;"><canvas id="facChart"></canvas></div>
        </div>
      </section>
      
      <!-- 3. HOD VIEW -->
      <section id="view-hod" class="view-section">
        <div class="filters-bar">
          <select id="hod-class" class="custom-select" style="flex:1;" onchange="updateHodSubjects(); renderHodView();">
            <option value="">🏫 All Classes</option>
            <option value="FE">FE</option><option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option>
          </select>
          <select id="hod-subject" class="custom-select" style="flex:1;" onchange="renderHodView()">
            <option value="">📘 All Subjects</option>
          </select>
        </div>
        <div class="grid-cards">
          <div class="stat-card">
             <div class="stat-title">Total Present Today</div>
             <div class="stat-value" id="hod-present">0</div>
          </div>
          <div class="stat-card">
             <div class="stat-title">Total Students</div>
             <div class="stat-value" id="hod-total">0</div>
          </div>
          <div class="stat-card">
             <div class="stat-title">% Attendance</div>
             <div class="stat-value" id="hod-pct">0%</div>
          </div>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>Subject</th><th>Students Present (Today)</th><th>Avg Attendance %</th></tr></thead>
            <tbody id="hod-tbody"></tbody>
          </table>
        </div>
        <div class="chart-box" style="margin-top: 24px;">
           <div class="chart-title">Subject-wise Attendance Comparison</div>
           <div class="chart-container" style="height: 300px;"><canvas id="hodChart"></canvas></div>
        </div>
      </section>
      
      <!-- 4. PRINCIPAL VIEW -->
      <section id="view-principal" class="view-section">
        <div class="dept-grid">
           <div class="dept-card" onclick="openHodForDept('Computer')">
              <div class="dept-icon">💻</div><div class="dept-title">Computer</div>
           </div>
           <div class="dept-card" onclick="openHodForDept('Electrical')">
              <div class="dept-icon">⚡</div><div class="dept-title">Electrical</div>
           </div>
           <div class="dept-card" onclick="openHodForDept('Civil')">
              <div class="dept-icon">🏗</div><div class="dept-title">Civil</div>
           </div>
           <div class="dept-card" onclick="openHodForDept('Mechanical')">
              <div class="dept-icon">⚙</div><div class="dept-title">Mechanical</div>
           </div>
           <div class="dept-card" onclick="openHodForDept('ENTC')">
              <div class="dept-icon">📡</div><div class="dept-title">ENTC</div>
           </div>
           <div class="dept-card" onclick="openHodForDept('FE')">
              <div class="dept-icon">🎓</div><div class="dept-title">First Year</div>
           </div>
        </div>
      </section>

    </div>
  </main>

  <script>
    let rawRecords = [];
    let validRecords = []; 
    let subjectLectures = {}; 
    let studentInfo = {}; // name -> { className }
    let datesList = [];
    
    // Chart instances
    let dashBar = null;
    let dashLine = null;
    let facChartCtx = null;
    let hodChartCtx = null;

    async function init() {
      try {
        const res = await fetch("/api/dashboard");
        const data = await res.json();
        // Prevent unnecessary full UI re-renders if length is strictly same (optional optimization)
        rawRecords = data.records || [];
        processData();
        renderCurrentView();
      } catch(err) {
        console.error("Error fetching data:", err);
      }
    }

    function processData() {
      const uniqueStudentAtt = new Map();
      studentInfo = {};

      // 1. Deduplication: Count a student ONLY ONCE per subject per day
      rawRecords.forEach(r => {
        if (r.role === 'STUDENT') {
          const sName = r.name.trim();
          const sClass = r.className.trim() || 'Unknown';
          const sSub = r.subject.trim();
          const sDate = r.date.trim();
          
          const key = \`\${sDate}-\${sSub}-\${sName}\`;
          
          if (!uniqueStudentAtt.has(key)) {
            uniqueStudentAtt.set(key, { name: sName, className: sClass, subject: sSub, date: sDate });
          }
          studentInfo[sName] = { className: sClass };
        }
      });
      
      validRecords = Array.from(uniqueStudentAtt.values());
      datesList = [...new Set(validRecords.map(r => r.date))].sort();

      // 2. Compute Max Lectures per subject
      const subjectDateMap = {}; 
      validRecords.forEach(r => {
        if (!subjectDateMap[r.subject]) subjectDateMap[r.subject] = new Set();
        subjectDateMap[r.subject].add(r.date);
      });
      
      subjectLectures = {};
      for (const sub in subjectDateMap) {
        subjectLectures[sub] = subjectDateMap[sub].size || 1;
      }

      // Populate global dropdowns once
      populateSubjectDropdown('fac-subject');
      populateSubjectDropdown('hod-subject');
    }

    function populateSubjectDropdown(id) {
       const select = document.getElementById(id);
       const currentValue = select.value;
       select.innerHTML = '<option value="">📘 All Subjects</option>';
       Object.keys(subjectLectures).sort().forEach(sub => {
          select.innerHTML += \`<option value="\${sub}">\${sub}</option>\`;
       });
       if(Object.keys(subjectLectures).includes(currentValue)) select.value = currentValue;
    }

    function getFilteredRecords() {
      const gClass = document.getElementById("global-class").value;
      if (!gClass) return validRecords;
      return validRecords.filter(r => r.className === gClass);
    }

    function getStudentsInScope(scopeRecords) {
       const students = new Set();
       const gClass = document.getElementById("global-class").value;
       Object.keys(studentInfo).forEach(s => {
          if (!gClass || studentInfo[s].className === gClass) {
             students.add(s);
          }
       });
       return Array.from(students);
    }

    /* --- DASHBOARD VIEW --- */
    function renderDashboard() {
      const records = getFilteredRecords();
      const allStudents = getStudentsInScope(records);
      const totalStuds = allStudents.length || 1;
      const latestDate = datesList.length ? datesList[datesList.length - 1] : null;

      let presentTodayCount = 0;
      let subPresencesToday = {};
      let weeklyTrend = {};
      
      // Initialize weekly trend
      datesList.slice(-7).forEach(d => weeklyTrend[d] = new Set());

      records.forEach(r => {
         if (r.date === latestDate) {
            subPresencesToday[r.subject] = (subPresencesToday[r.subject] || 0) + 1;
         }
         if (weeklyTrend[r.date] !== undefined) {
            weeklyTrend[r.date].add(r.name);
         }
      });
      
      if (latestDate) {
         presentTodayCount = weeklyTrend[latestDate] ? weeklyTrend[latestDate].size : 0;
      }
      const absentToday = totalStuds > presentTodayCount ? (totalStuds - presentTodayCount) : 0;
      let pct = totalStuds > 0 ? ((presentTodayCount / totalStuds) * 100) : 0;

      document.getElementById("dash-present").innerText = presentTodayCount;
      document.getElementById("dash-absent").innerText = absentToday;
      document.getElementById("dash-pct").innerText = pct.toFixed(1) + "%";

      // Dash Bar Chart: Subject vs Students Present (Today)
      dashBar = buildChart('dashBarChart', dashBar, 'bar', Object.keys(subPresencesToday), Object.values(subPresencesToday), 'Students Present Today', '#3b82f6');
      
      // Dash Line Chart: Weekly Attendance Trend (% of total students over the last 7 days)
      const lineLabels = Object.keys(weeklyTrend);
      const lineData = lineLabels.map(d => {
         return totalStuds > 0 ? ((weeklyTrend[d].size / totalStuds) * 100).toFixed(1) : 0;
      });
      dashLine = buildChart('dashLineChart', dashLine, 'line', lineLabels, lineData, 'Daily Overall Attendance %', '#10b981');
    }

    /* --- FACULTY VIEW --- */
    function renderFacultyView() {
      const gClass = document.getElementById("global-class").value;
      const search = document.getElementById("fac-search").value.toLowerCase();
      const selSub = document.getElementById("fac-subject").value;
      
      let students = Object.keys(studentInfo).filter(s => {
         if (gClass && studentInfo[s].className !== gClass) return false;
         if (search && !s.toLowerCase().includes(search)) return false;
         return true;
      });

      const scopeSubjects = selSub ? [selSub] : Object.keys(subjectLectures);
      let totalLecs = 0;
      let totalAttended = 0;

      const tbody = document.getElementById("fac-tbody");
      let rows = "";
      
      // Calculate attendance per student, per subject
      let chartDataMap = {}; // subject -> attended %
      
      students.forEach(student => {
         let stuTotalLec = 0;
         let stuAttended = 0;
         
         scopeSubjects.forEach(sub => {
            const maxLec = subjectLectures[sub] || 1;
            const attendedCount = validRecords.filter(r => r.name === student && r.subject === sub).length;
            // % MUST NEVER exceed 100
            const finalAttended = Math.min(attendedCount, maxLec);
            
            totalLecs += maxLec;
            totalAttended += finalAttended;
            
            stuTotalLec += maxLec;
            stuAttended += finalAttended;
            
            // For chart aggregation if specific student is selected
            if (students.length === 1) {
               chartDataMap[sub] = (finalAttended / maxLec) * 100;
            }
         });
         
         const stuPct = stuTotalLec > 0 ? ((stuAttended / stuTotalLec) * 100) : 0;
         const isDefaulter = stuPct < 75;
         
         rows += \`<tr>
            <td style="font-weight:600;">\${student}</td>
            <td>\${selSub ? selSub : 'All Assigned'}</td>
            <td><div style="font-weight:600; color:\${isDefaulter ? 'var(--danger)' : 'var(--text-main)'}">\${stuPct.toFixed(1)}%</div></td>
            <td><span class="badge \${isDefaulter ? 'badge-danger' : 'badge-success'}">\${isDefaulter ? 'Defaulter' : 'OK'}</span></td>
         </tr>\`;
      });
      
      tbody.innerHTML = rows || '<tr><td colspan="4" style="text-align:center;">No students matched criteria.</td></tr>';

      const ovPct = totalLecs > 0 ? ((totalAttended / totalLecs) * 100) : 0;
      document.getElementById("fac-lec-total").innerText = totalLecs;
      document.getElementById("fac-lec-attended").innerText = totalAttended;
      document.getElementById("fac-att-pct").innerText = ovPct.toFixed(1) + "%";

      // Render chart
      let cLabels = []; let cData = [];
      if (students.length === 1) {
         document.getElementById("fac-chart-title").innerText = \`Subject-wise Attendance for \${students[0]}\`;
         cLabels = Object.keys(chartDataMap);
         cData = Object.values(chartDataMap);
      } else {
         document.getElementById("fac-chart-title").innerText = \`Subject-wise Attendance (Average %)\`;
         // compute average attendance per subject across all scoped students
         scopeSubjects.forEach(sub => {
            const maxLec = subjectLectures[sub] || 1;
            let subTotalAtt = 0;
            students.forEach(student => {
               const attendedCount = validRecords.filter(r => r.name === student && r.subject === sub).length;
               subTotalAtt += Math.min(attendedCount, maxLec);
            });
            const subTotalPoss = maxLec * students.length;
            cLabels.push(sub);
            cData.push(subTotalPoss > 0 ? (subTotalAtt / subTotalPoss) * 100 : 0);
         });
      }
      
      facChartCtx = buildChart('facChart', facChartCtx, 'bar', cLabels, cData, 'Attendance %', '#8b5cf6');
    }

    /* --- HOD VIEW --- */
    function updateHodSubjects() {
      const hClass = document.getElementById("hod-class").value;
      const hSub = document.getElementById("hod-subject");
      hSub.innerHTML = '<option value="">📘 All Subjects</option>';
      const subjectsForClass = new Set();
      validRecords.forEach(r => {
        if (!hClass || r.className === hClass) subjectsForClass.add(r.subject);
      });
      subjectsForClass.forEach(s => {
        hSub.innerHTML += \`<option value="\${s}">\${s}</option>\`;
      });
    }

    function renderHodView() {
      const gClass = document.getElementById("global-class").value; 
      const hClass = document.getElementById("hod-class").value;
      const hSub = document.getElementById("hod-subject").value;
      
      // If global is set, it overrides or strictly intersects hClass. We will intersect them cleanly.
      const finalClass = hClass || gClass; 

      let records = validRecords;
      if (finalClass) records = records.filter(r => r.className === finalClass);
      if (hSub) records = records.filter(r => r.subject === hSub);

      const latestDate = datesList.length ? datesList[datesList.length - 1] : null;

      // Extract unique students in scope logically
      let scopeStudents = Object.keys(studentInfo);
      if (finalClass) scopeStudents = scopeStudents.filter(s => studentInfo[s].className === finalClass);
      
      const totalStuds = scopeStudents.length || 1;
      
      let presentToday = 0;
      if (latestDate) {
         presentToday = new Set(records.filter(r => r.date === latestDate).map(r => r.name)).size;
      }

      // Compute % Overall
      const scopeSubjects = hSub ? [hSub] : Object.keys(subjectLectures);
      let ovAtt = 0; let ovPoss = 0;
      let subjectAverages = {};

      scopeSubjects.forEach(sub => {
         const maxLec = subjectLectures[sub] || 1;
         let subAtt = 0;
         scopeStudents.forEach(stu => {
            const attCount = validRecords.filter(r => r.name === stu && r.subject === sub).length;
            subAtt += Math.min(attCount, maxLec);
         });
         const subPoss = maxLec * scopeStudents.length;
         
         ovAtt += subAtt; ovPoss += subPoss;
         subjectAverages[sub] = { 
            avgPct: subPoss > 0 ? (subAtt / subPoss) * 100 : 0,
            presentToday: latestDate ? new Set(records.filter(r=>r.subject===sub && r.date===latestDate).map(n=>n.name)).size : 0
         };
      });

      const pct = ovPoss > 0 ? (ovAtt / ovPoss) * 100 : 0;

      document.getElementById("hod-total").innerText = scopeStudents.length;
      document.getElementById("hod-present").innerText = presentToday;
      document.getElementById("hod-pct").innerText = pct.toFixed(1) + "%";

      const tbody = document.getElementById("hod-tbody");
      let rows = "";
      scopeSubjects.forEach(sub => {
         rows += \`<tr>
            <td>\${sub}</td>
            <td>\${subjectAverages[sub].presentToday}</td>
            <td>\${subjectAverages[sub].avgPct.toFixed(1)}%</td>
         </tr>\`;
      });
      tbody.innerHTML = rows;

      // HOD Chart
      const cLabels = Object.keys(subjectAverages);
      const cData = cLabels.map(l => subjectAverages[l].avgPct);
      hodChartCtx = buildChart('hodChart', hodChartCtx, 'bar', cLabels, cData, 'Subject Average %', '#06b6d4');
    }

    function openHodForDept(dept) {
       // Mapping purely for UI flow as requested
       if (dept === 'FE') {
          document.getElementById('global-class').value = 'FE';
       } else {
          document.getElementById('global-class').value = '';
       }
       switchTab('hod');
    }

    /* --- CHART BUILDER --- */
    function buildChart(canvasId, instance, type, labels, data, labelText, color) {
      if (instance) instance.destroy();
      const ctx = document.getElementById(canvasId).getContext("2d");
      
      Chart.defaults.color = '#94a3b8';
      Chart.defaults.font.family = 'Inter';

      return new Chart(ctx, {
        type: type,
        data: {
          labels: labels,
          datasets: [{
            label: labelText,
            data: data,
            backgroundColor: type === 'bar' ? color : 'rgba(16, 185, 129, 0.1)',
            borderColor: color,
            borderWidth: type === 'line' ? 3 : 0,
            borderRadius: type === 'bar' ? 4 : 0,
            fill: type === 'line',
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
             legend: { display: false },
             tooltip: { backgroundColor: '#1e293b', titleColor: '#fff', bodyColor: '#fff', borderColor: '#334155', borderWidth: 1 }
          },
          scales: {
            y: { beginAtZero: true, max: (labelText.includes('%') ? 100 : undefined), grid: { color: 'rgba(51, 65, 85, 0.4)' } },
            x: { grid: { display: false } }
          }
        }
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
        'hod': 'HOD Admin View',
        'principal': 'Principal Operations'
      };
      
      let pTitle = titles[viewName];
      document.getElementById("page-title").innerText = pTitle;

      renderCurrentView(viewName);
    }

    function renderCurrentView(viewIdArg) {
      let viewId = viewIdArg;
      if (!viewId) {
         const activeViewEl = document.querySelector('.view-section.active');
         if (!activeViewEl) return;
         viewId = activeViewEl.id.replace('view-', '');
      }

      if (viewId === 'dashboard') renderDashboard();
      if (viewId === 'faculty') renderFacultyView();
      if (viewId === 'hod') {
        updateHodSubjects();
        renderHodView();
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
      init();
      setInterval(init, 5000); // Auto refresh every 5 seconds
    });
  </script>
</body>
</html>
  `);
});

