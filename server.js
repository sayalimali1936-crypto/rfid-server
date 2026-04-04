const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");
const staffPath = path.join(__dirname, "Staff_Master.csv");

/* ================= CORE BACKEND LOGIC ================= */
if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(csvPath, "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

function loadCSV(file) {
  try {
    const data = fs.readFileSync(file, "utf8");
    const lines = data.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = lines.shift().split(",");
    return lines.map(l => {
      let obj = {};
      l.split(",").forEach((v, i) => obj[headers[i]] = v);
      return obj;
    });
  } catch (e) { return []; }
}

const studentsMaster = loadCSV(studentsPath);
const timetable = loadCSV(timetablePath);

function getAnalytics(filters) {
  const raw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1);
  let records = raw.map(l => {
    let p = l.split(",");
    if (p.length < 8) return null;
    return { date: p[0], name: p[3], className: p[5], subject: p[7] };
  }).filter(x => x);

  // Apply Filters
  if (filters.className) records = records.filter(r => r.className === filters.className);
  if (filters.subject) records = records.filter(r => r.subject === filters.subject);
  if (filters.studentName) records = records.filter(r => r.name === filters.studentName);

  // Subject-wise Data for Graphs
  let subjectWise = {};
  records.forEach(r => {
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
  });

  // Defaulter Logic (Based on unique student names in the class)
  let studentStats = {};
  records.forEach(r => {
    if (!studentStats[r.name]) studentStats[r.name] = 0;
    studentStats[r.name]++;
  });

  const totalLecturesTarget = 40; // Assumed total lectures for the semester
  let defaulters = [];
  Object.entries(studentStats).forEach(([name, count]) => {
    let perc = (count / totalLecturesTarget) * 100;
    if (perc < 75) defaulters.push({ name, count, perc: perc.toFixed(1) });
  });

  let present = records.length;
  let totalInClass = 60; // Standard batch
  let absent = Math.max(0, totalInClass - present);
  let percent = ((present / (totalInClass || 1)) * 100).toFixed(1);

  return { 
    present, absent, percent, totalInClass, 
    subjectWise, defaulters, defaulterCount: defaulters.length 
  };
}

/* ================= API ROUTE ================= */
app.get("/api/data", (req, res) => {
  res.json({
    analytics: getAnalytics(req.query),
    subjects: [...new Set(timetable.map(t => t.subject))],
    students: [...new Set(studentsMaster.map(s => s.Name))]
  });
});

/* ================= UI LAYOUT ================= */
function layout(title, content, dept = "General") {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: #2563eb; --slate: #1e293b; --bg: #f8fafc; --danger: #ef4444; --success: #10b981; }
        body { margin:0; font-family:'Segoe UI', sans-serif; background:var(--bg); color:var(--slate); display:flex; height:100vh; }
        
        .sidebar { width:260px; background:var(--slate); color:white; padding:25px; display:flex; flex-direction:column; }
        .sidebar h2 { color: #60a5fa; font-size:1.2rem; margin-bottom:40px; }
        .nav-item { padding:12px; color:#94a3b8; text-decoration:none; display:flex; align-items:center; gap:12px; border-radius:8px; transition:0.3s; margin-bottom:5px; }
        .nav-item:hover, .nav-item.active { background:#334155; color:white; }

        .main { flex:1; padding:40px; overflow-y:auto; scroll-behavior: smooth; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; }
        
        .grid-cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:30px; }
        .card { background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transition:0.3s; }
        .card:hover { transform:translateY(-5px); border-color:var(--primary); }
        .card h4 { margin:0; font-size:0.8rem; color:#64748b; text-transform:uppercase; }
        .card h2 { margin:10px 0 0 0; font-size:1.8rem; }

        .filter-section { background:white; padding:20px; border-radius:12px; margin-bottom:20px; display:flex; gap:15px; align-items:center; border:1px solid #e2e8f0; }
        select, input { padding:10px; border-radius:8px; border:1px solid #cbd5e1; outline:none; font-family:inherit; }
        
        .chart-container { background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:20px; }
        table { width:100%; border-collapse:collapse; margin-top:15px; }
        th { text-align:left; padding:12px; background:#f1f5f9; color:#475569; font-size:0.9rem; }
        td { padding:12px; border-bottom:1px solid #f1f5f9; }
        
        .badge-red { background:#fee2e2; color:var(--danger); padding:4px 8px; border-radius:6px; font-size:0.8rem; font-weight:600; }
        
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animated { animation: fadeIn 0.5s ease-out; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2><i class="fas fa-university"></i> ${dept} Portal</h2>
        <a href="/principal" class="nav-item"><i class="fas fa-home"></i> Home</a>
        <a href="/hod?dept=${dept}" class="nav-item"><i class="fas fa-user-shield"></i> HOD View</a>
        <a href="/faculty?dept=${dept}" class="nav-item"><i class="fas fa-chalkboard-user"></i> Faculty View</a>
        <div style="margin-top:auto"><a href="/login" class="nav-item" style="color:var(--danger)"><i class="fas fa-sign-out-alt"></i> Logout</a></div>
    </div>
    <div class="main animated">
        <div class="header">
            <h1>${title}</h1>
            <div style="color:var(--primary); font-weight:600">${new Date().toLocaleDateString()}</div>
        </div>
        ${content}
    </div>
</body>
</html>
`;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
  const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "1st Year"];
  const content = `
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px">
        ${depts.map(d => `
            <div class="card" style="cursor:pointer; text-align:center; padding:40px" onclick="location.href='/hod?dept=${d}'">
                <i class="fas fa-graduation-cap fa-3x" style="color:var(--primary); margin-bottom:15px"></i>
                <h2>${d}</h2>
                <p style="color:#64748b">Enter Department HOD Office</p>
            </div>
        `).join("")}
    </div>
  `;
  res.send(layout("Campus Directory", content, "Principal"));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
  const dept = req.query.dept || "Electrical";
  res.send(layout("HOD Control Desk", `
    <div class="filter-section">
        <span>Select Class: </span>
        <select id="clsFilter" onchange="loadHODData()">
            <option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option>
        </select>
    </div>
    <div class="grid-cards">
        <div class="card"><h4>Present Students</h4><h2 id="h-pres">0</h2></div>
        <div class="card"><h4>Total Strength</h4><h2 id="h-total">0</h2></div>
        <div class="card"><h4>Attendance %</h4><h2 id="h-perc" style="color:var(--primary)">0%</h2></div>
    </div>
    <div class="chart-container">
        <h3>Subject Wise Analysis</h3>
        <canvas id="hodChart" height="100"></canvas>
    </div>
    <script>
        let myChart;
        async function loadHODData(){
            const cls = document.getElementById("clsFilter").value;
            const res = await fetch("/api/data?className="+cls).then(r=>r.json());
            const d = res.analytics;
            
            document.getElementById("h-pres").innerText = d.present;
            document.getElementById("h-total").innerText = d.totalInClass;
            document.getElementById("h-perc").innerText = d.percent + "%";

            if(myChart) myChart.destroy();
            myChart = new Chart(document.getElementById('hodChart'), {
                type: 'bar',
                data: {
                    labels: Object.keys(d.subjectWise),
                    datasets: [{ label: '% Attendance', data: Object.values(d.subjectWise).map(v=>((v/60)*100).toFixed(1)), backgroundColor: '#3b82f6' }]
                }
            });
        }
        loadHODData();
    </script>
  `, dept));
});

/* ================= FACULTY VIEW (Unified) ================= */
app.get("/faculty", (req, res) => {
  const dept = req.query.dept || "Electrical";
  res.send(layout("Unified Faculty View", `
    <div class="filter-section">
        <select id="f-sub" onchange="refresh()">
            <option value="">All Subjects</option>
        </select>
        <div style="position:relative; flex:1">
            <input type="text" id="f-stud" placeholder="Search Student Name..." style="width:100%" oninput="refresh()">
            <div id="stud-list" style="position:absolute; background:white; width:100%; z-index:10; border:1px solid #ddd; max-height:150px; overflow-y:auto; display:none"></div>
        </div>
    </div>

    <div class="grid-cards">
        <div class="card"><h4>Total Class Strength</h4><h2 id="f-total-s">60</h2></div>
        <div class="card"><h4>Present</h4><h2 id="f-pres" style="color:var(--success)">0</h2></div>
        <div class="card"><h4>Absent</h4><h2 id="f-abs" style="color:var(--danger)">0</h2></div>
        <div class="card"><h4>Class %</h4><h2 id="f-perc">0%</h2></div>
        <div class="card" style="border-left:5px solid var(--danger)"><h4>Defaulters (<75%)</h4><h2 id="f-def-count">0</h2></div>
    </div>

    <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px">
        <div class="chart-container">
            <h3>Subject-wise Class Attendance (%)</h3>
            <canvas id="facChart" height="150"></canvas>
        </div>
        <div class="chart-container">
            <h3>Defaulter Students List</h3>
            <div style="max-height:300px; overflow-y:auto">
                <table id="def-table">
                    <thead><tr><th>Name</th><th>Count</th><th>%</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        let fChart;
        async function refresh() {
            const sub = document.getElementById("f-sub").value;
            const stud = document.getElementById("f-stud").value;
            const res = await fetch(\`/api/data?subject=\${sub}&studentName=\${stud}\`).then(r=>r.json());
            const d = res.analytics;

            document.getElementById("f-pres").innerText = d.present;
            document.getElementById("f-abs").innerText = d.absent;
            document.getElementById("f-perc").innerText = d.percent + "%";
            document.getElementById("f-def-count").innerText = d.defaulterCount;

            // Load Defaulter Table
            const tbody = document.querySelector("#def-table tbody");
            tbody.innerHTML = d.defaulters.map(s => \`
                <tr><td>\${s.name}</td><td>\${s.count}</td><td><span class="badge-red">\${s.perc}%</span></td></tr>
            \`).join("");

            // Update Chart
            if(fChart) fChart.destroy();
            fChart = new Chart(document.getElementById('facChart'), {
                type: 'bar',
                data: {
                    labels: Object.keys(d.subjectWise),
                    datasets: [{ label: '% Attendance', data: Object.values(d.subjectWise).map(v=>((v/60)*100).toFixed(1)), backgroundColor: '#6366f1' }]
                },
                options: { scales: { y: { beginAtZero: true, max: 100 } } }
            });

            // Fill Filters once
            if(document.getElementById("f-sub").children.length <= 1) {
                res.subjects.forEach(s => document.getElementById("f-sub").innerHTML += \`<option value="\${s}">\${s}</option>\`);
            }
        }
        refresh();
    </script>
  `, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
  res.send(`
    <body style="background:#f1f5f9; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif">
        <div style="background:white; padding:50px; border-radius:20px; box-shadow:0 10px 25px rgba(0,0,0,0.1); text-align:center; width:350px">
            <h1 style="color:#2563eb">RFID Access</h1>
            <button onclick="location.href='/principal'" style="width:100%; padding:15px; background:#2563eb; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold">Enter Portal</button>
        </div>
    </body>
  `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Server running at http://localhost:" + PORT));