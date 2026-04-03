const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");
const staffPath = path.join(__dirname, "Staff_Master.csv");

/* ================= INIT (Unchanged) ================= */
if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(csvPath, "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

/* ================= LOAD CSV (Unchanged) ================= */
function loadCSV(file) {
  try {
    const data = fs.readFileSync(file, "utf8");
    const lines = data.trim().split(/\r?\n/);
    const headers = lines.shift().split(",");
    return lines.map(l => {
      let obj = {};
      l.split(",").forEach((v, i) => obj[headers[i]] = v);
      return obj;
    });
  } catch (e) { return []; }
}

const students = loadCSV(studentsPath);
const timetable = loadCSV(timetablePath);
const staff = loadCSV(staffPath);

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
  res.send(`
<html>
<head>
    <style>
        body { margin:0; font-family:'Segoe UI',sans-serif; background:#020617; color:white; display:flex; align-items:center; justify-content:center; height:100vh; }
        .login-card { background:#1e293b; padding:40px; border-radius:16px; width:350px; box-shadow:0 10px 25px rgba(0,0,0,0.5); border:1px solid #334155; text-align:center; }
        h2 { margin-bottom:20px; color:#6366f1; }
        select, input { width:100%; padding:12px; margin:10px 0; border-radius:8px; border:1px solid #334155; background:#0f172a; color:white; box-sizing:border-box; }
        button { width:100%; padding:12px; margin-top:20px; border-radius:8px; border:none; background:#6366f1; color:white; font-weight:bold; cursor:pointer; transition:0.3s; }
        button:hover { background:#4f46e5; transform:scale(1.02); }
    </style>
</head>
<body>
    <div class="login-card">
        <h2>Portal Login</h2>
        <select id="role">
            <option value="faculty">Faculty Member</option>
            <option value="hod">Head of Dept (HOD)</option>
            <option value="principal">Principal</option>
        </select>
        <input id="name" placeholder="Enter Full Name">
        <button onclick="go()">Access Dashboard</button>
    </div>
    <script>
        function go(){
            let role=document.getElementById("role").value;
            let name=document.getElementById("name").value;
            if(!name) return alert("Please enter your name");
            window.location="/"+role+"?name="+name;
        }
    </script>
</body>
</html>
`);
});

/* ================= DATA (Unchanged) ================= */
function getData(filters) {
  const raw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1);
  let records = raw.map(l => {
    let p = l.split(",");
    if (p.length < 8) return null;
    return { name: p[3], className: p[5], subject: p[7] };
  }).filter(x => x);

  if (filters.className) records = records.filter(r => r.className === filters.className);
  if (filters.subject) records = records.filter(r => r.subject === filters.subject);

  let subjectWise = {}, studentsSet = new Set();
  records.forEach(r => {
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
    studentsSet.add(r.name);
  });

  let present = records.length;
  let totalStudents = studentsSet.size || 0;
  let percent = totalStudents > 0 ? ((present / totalStudents) * 100).toFixed(1) : 0;

  return { present, totalStudents, percent, subjectWise };
}

/* ================= API (Unchanged) ================= */
app.get("/api", (req, res) => {
  const data = getData(req.query);
  const subjects = [...new Set(timetable.map(t => t.subject))];
  const classes = ["SE", "TE", "BE"];
  res.json({ ...data, subjects, classes });
});

/* ================= UI TEMPLATE ================= */
function layout(title, content) {
  return `
<html>
<head>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
    :root { --primary: #6366f1; --bg-dark: #020617; --card-bg: #1e293b; }
    body { margin:0; font-family:'Segoe UI',sans-serif; background:linear-gradient(135deg, #020617, #0f172a); color:white; display:flex; min-height:100vh; }
    
    /* SIDEBAR */
    .sidebar { width:260px; background:var(--bg-dark); padding:25px; border-right:1px solid #1e293b; position:sticky; top:0; height:100vh; }
    .sidebar h2 { color:var(--primary); font-size:1.5rem; margin-bottom:30px; display:flex; align-items:center; gap:10px; }
    .sidebar a { display:flex; align-items:center; gap:12px; padding:12px 15px; margin:10px 0; background:transparent; border-radius:10px; color:#94a3b8; text-decoration:none; transition:.3s; }
    .sidebar a:hover, .sidebar a.active { background:var(--card-bg); color:white; }
    .sidebar a i { width:20px; }
    .logout { margin-top: auto; color:#ef4444 !important; }

    /* MAIN */
    .main { flex:1; padding:40px; overflow-y:auto; }
    .header-area { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; }
    
    /* CARDS */
    .cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:30px; }
    .card { padding:25px; border-radius:16px; background:var(--card-bg); border:1px solid #334155; position:relative; overflow:hidden; }
    .card h3 { margin:0; font-size:0.9rem; color:#94a3b8; text-transform:uppercase; }
    .card h2 { margin:10px 0 0 0; font-size:2rem; }
    .card::after { content:''; position:absolute; bottom:0; left:0; width:100%; height:4px; background:var(--primary); }

    /* TABLE */
    .table-container { background:var(--card-bg); border-radius:16px; padding:20px; border:1px solid #334155; }
    table { width:100%; border-collapse:collapse; }
    th { text-align:left; color:#94a3b8; font-weight:500; padding:15px; border-bottom:2px solid #334155; }
    td { padding:15px; border-bottom:1px solid #334155; }
    
    select { padding:10px 15px; border-radius:8px; background:var(--card-bg); color:white; border:1px solid var(--primary); outline:none; margin-bottom:20px; cursor:pointer; }
    
    .badge { padding:4px 10px; border-radius:20px; background:rgba(99,102,241,0.2); color:var(--primary); font-size:0.8rem; }
</style>
</head>
<body>
    <div class="sidebar">
        <h2><i class="fas fa-microchip"></i> RFID Sys</h2>
        <a href="/dashboard"><i class="fas fa-home"></i> Home</a>
        <a href="/faculty"><i class="fas fa-chalkboard-teacher"></i> Faculty</a>
        <a href="/hod"><i class="fas fa-user-tie"></i> HOD</a>
        <a href="/principal"><i class="fas fa-university"></i> Principal</a>
        <div style="height:50px"></div>
        <a href="/login" class="logout"><i class="fas fa-sign-out-alt"></i> Logout</a>
    </div>

    <div class="main">
        <div class="header-area">
            <h1>${title}</h1>
            <div id="clock"></div>
        </div>
        ${content}
    </div>

    <script>
        function updateClock() {
            const now = new Date();
            document.getElementById('clock').innerText = now.toLocaleTimeString();
        }
        setInterval(updateClock, 1000);
        updateClock();
    </script>
</body>
</html>
`;
}

/* ================= FACULTY ================= */
app.get("/faculty", (req, res) => {
  let teacher = req.query.name || "Faculty";
  let subject = timetable.find(t => t.staff_name === teacher)?.subject || "Not Assigned";

  res.send(layout("Faculty Dashboard", `
    <div style="margin-bottom:20px">
        <span class="badge">Active Session</span>
        <h2 style="margin:5px 0">Welcome, ${teacher}</h2>
        <p style="color:#94a3b8">Assigned Subject: <b style="color:white">${subject}</b></p>
    </div>

    <div class="cards">
        <div class="card"><h3>Present</h3><h2 id="present">0</h2></div>
        <div class="card"><h3>Total Students</h3><h2 id="total">0</h2></div>
        <div class="card"><h3>Attendance %</h3><h2 id="percent">0%</h2></div>
    </div>

    <div class="table-container">
        <h3>Subject Statistics</h3>
        <table>
            <thead><tr><th>Subject Name</th><th>Count</th></tr></thead>
            <tbody id="table"></tbody>
        </table>
    </div>

    <script>
    async function load(){
        let d = await fetch("/api?subject=${subject}").then(r=>r.json());
        document.getElementById("present").innerText = d.present;
        document.getElementById("total").innerText = d.totalStudents;
        document.getElementById("percent").innerText = d.percent + "%";
        
        let html = "";
        Object.entries(d.subjectWise).forEach(([s,v]) => {
            html += \`<tr><td>\${s}</td><td><span class="badge">\${v} Students</span></td></tr>\`;
        });
        document.getElementById("table").innerHTML = html;
    }
    load();
    </script>
`));
});

/* ================= HOD ================= */
app.get("/hod", (req, res) => {
  res.send(layout("HOD Dashboard", `
    <div style="display:flex; align-items:center; gap:15px">
        <span>Select Class: </span>
        <select id="className" onchange="loadData()">
            <option value="SE">SE</option>
            <option value="TE">TE</option>
            <option value="BE">BE</option>
        </select>
    </div>

    <div class="cards">
        <div class="card"><h3>Students Present</h3><h2 id="present">0</h2></div>
        <div class="card"><h3>Total Enrollment</h3><h2 id="total">0</h2></div>
        <div class="card"><h3>Overall %</h3><h2 id="percent">0%</h2></div>
    </div>

    <div class="table-container">
        <h3>Departmental Subject Report</h3>
        <table>
            <thead><tr><th>Subject</th><th>Attendance Count</th></tr></thead>
            <tbody id="table"></tbody>
        </table>
    </div>

    <script>
    async function loadData(){
        const cls = document.getElementById("className").value;
        let d = await fetch("/api?className=" + cls).then(r=>r.json());

        document.getElementById("present").innerText = d.present;
        document.getElementById("total").innerText = d.totalStudents;
        document.getElementById("percent").innerText = d.percent + "%";

        let html = "";
        Object.entries(d.subjectWise).forEach(([s,v]) => {
            html += \`<tr><td>\${s}</td><td><span class="badge">\${v}</span></td></tr>\`;
        });
        document.getElementById("table").innerHTML = html;
    }
    loadData(); // Initial load
    </script>
`));
});

/* ================= PRINCIPAL ================= */
app.get("/principal", (req, res) => {
  const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "First Year"];
  let deptCards = depts.map(d => `
    <div class="card" style="cursor:pointer" onclick="alert('Viewing \${d} Details')">
        <h3>Department</h3>
        <h2>${d}</h2>
        <div style="margin-top:10px; font-size:0.8rem; color:#6366f1">Click to view analytical report →</div>
    </div>
  `).join("");

  res.send(layout("Campus Overview", `
    <div class="cards">
        ${deptCards}
    </div>
    <div class="table-container">
        <h3>System Status</h3>
        <p><i class="fas fa-check-circle" style="color:#22c55e"></i> All RFID Readers are Online</p>
        <p><i class="fas fa-sync" style="color:var(--primary)"></i> Last Database Sync: Just now</p>
    </div>
`));
});

/* ================= HOME ================= */
app.get("/dashboard", (req, res) => {
  res.send(layout("System Overview", `
    <div class="card" style="background: linear-gradient(to right, #1e293b, #334155); padding: 40px;">
        <h1 style="margin:0">Smart RFID Attendance System</h1>
        <p style="color:#94a3b8; font-size:1.2rem">Real-time tracking and reporting for institutional efficiency.</p>
        <div style="display:flex; gap:20px; margin-top:30px">
            <div style="text-align:center">
                <i class="fas fa-users" style="font-size:2rem; color:var(--primary)"></i>
                <p>Automated</p>
            </div>
            <div style="text-align:center">
                <i class="fas fa-bolt" style="font-size:2rem; color:var(--primary)"></i>
                <p>Real-time</p>
            </div>
            <div style="text-align:center">
                <i class="fas fa-shield-alt" style="font-size:2rem; color:var(--primary)"></i>
                <p>Secure</p>
            </div>
        </div>
    </div>
`));
});

/* ================= START ================= */
app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Server running on http://localhost:" + PORT));