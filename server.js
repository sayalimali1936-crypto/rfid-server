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
    if (lines.length === 0) return [];
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

/* ================= DATA LOGIC (Unchanged) ================= */
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
  let totalStudents = 60; // Default capacity per class
  let percent = ((present / totalStudents) * 100).toFixed(1);

  return { present, totalStudents, percent, subjectWise };
}

/* ================= UI LAYOUT ================= */
function layout(title, content, dept = "General") {
  return `
<html>
<head>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --bg: #0f172a; --card: #1e293b; --primary: #6366f1; 
            --accent: #10b981; --text: #f8fafc; --text-dim: #94a3b8;
        }
        body { 
            margin:0; font-family:'Inter', sans-serif; background: var(--bg); color: var(--text); 
            display:flex; height:100vh; overflow:hidden;
        }
        
        /* Sidebar */
        .sidebar { 
            width:260px; background: #020617; padding:25px; border-right:1px solid #334155;
            display:flex; flex-direction:column; gap:10px;
        }
        .sidebar h2 { color: var(--primary); font-size:1.2rem; margin-bottom:30px; }
        .nav-item { 
            padding:12px 15px; border-radius:10px; color: var(--text-dim); 
            text-decoration:none; transition:0.3s; display:flex; align-items:center; gap:10px;
        }
        .nav-item:hover, .nav-item.active { background: var(--card); color: white; transform: translateX(5px); }
        .dept-tag { font-size: 0.7rem; background: var(--primary); padding: 2px 8px; border-radius: 4px; margin-left: auto; }

        /* Main Content */
        .main { flex:1; padding:40px; overflow-y:auto; scroll-behavior: smooth; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:40px; }
        
        /* Cards */
        .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:25px; }
        .card { 
            background: var(--card); padding:25px; border-radius:20px; border:1px solid #334155;
            transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); animation: fadeIn 0.5s ease forwards;
        }
        .card:hover { transform: translateY(-10px); border-color: var(--primary); box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        .card h3 { color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; margin:0; }
        .card h2 { font-size: 2.5rem; margin:10px 0; }

        /* Chart-like Progress Bar */
        .progress-container { width: 100%; background: #0f172a; height: 10px; border-radius: 10px; margin-top:15px; overflow:hidden; }
        .progress-bar { height:100%; background: var(--primary); transition: width 1.5s ease-in-out; }

        /* Tabs & Filters */
        .controls { display:flex; gap:15px; margin-bottom:30px; align-items:center; }
        select { 
            padding:10px 20px; border-radius:10px; background: var(--card); color:white; 
            border:1px solid #334155; outline:none; cursor:pointer;
        }

        @keyframes fadeIn { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2><i class="fas fa-layer-group"></i> RFID Attendance</h2>
        <a href="/principal" class="nav-item"><i class="fas fa-university"></i> Principal View</a>
        <a href="/hod?dept=${dept}" class="nav-item"><i class="fas fa-user-tie"></i> HOD View <span class="dept-tag">${dept}</span></a>
        <a href="/faculty?dept=${dept}" class="nav-item"><i class="fas fa-chalkboard-teacher"></i> Faculty View <span class="dept-tag">${dept}</span></a>
        <div style="margin-top:auto">
            <a href="/login" class="nav-item" style="color: #ef4444"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
    </div>
    <div class="main">
        <div class="header">
            <h1>${title}</h1>
            <div id="date-display"></div>
        </div>
        ${content}
    </div>
    <script>
        document.getElementById('date-display').innerText = new Date().toDateString();
    </script>
</body>
</html>
`;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
  const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "First Year"];
  let content = `
    <p style="color: var(--text-dim)">Select a department to view detailed analytics.</p>
    <div class="grid">
        ${depts.map(d => `
            <div class="card" style="cursor:pointer" onclick="location.href='/hod?dept=${d}'">
                <h3>Department</h3>
                <h2>${d}</h2>
                <div style="color:var(--primary)">Click to view HOD dashboard <i class="fas fa-arrow-right"></i></div>
            </div>
        `).join("")}
    </div>
  `;
  res.send(layout("Campus Overview", content));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
  const dept = req.query.dept || "Electrical";
  const className = req.query.className || "SE";
  const data = getData({ className });

  let subjectCharts = Object.entries(data.subjectWise).map(([sub, count]) => {
    let p = ((count / 60) * 100).toFixed(0);
    return `
        <div style="margin-bottom:20px">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px">
                <span>${sub}</span>
                <span style="color:var(--primary)">${count}/60 (${p}%)</span>
            </div>
            <div class="progress-container"><div class="progress-bar" style="width:${p}%"></div></div>
        </div>
    `;
  }).join("");

  let content = `
    <div class="controls">
        <span>Select Class:</span>
        <select onchange="location.href='?dept=${dept}&className='+this.value">
            <option value="SE" ${className === 'SE' ? 'selected' : ''}>SE</option>
            <option value="TE" ${className === 'TE' ? 'selected' : ''}>TE</option>
            <option value="BE" ${className === 'BE' ? 'selected' : ''}>BE</option>
        </select>
    </div>

    <div class="grid" style="margin-bottom:40px">
        <div class="card"><h3>Present Students</h3><h2>${data.present}</h2></div>
        <div class="card"><h3>Total Students</h3><h2>${data.totalStudents}</h2></div>
        <div class="card">
            <h3>Attendance %</h3>
            <h2 style="color:var(--accent)">${data.percent}%</h2>
            <div class="progress-container"><div class="progress-bar" style="width:${data.percent}%; background:var(--accent)"></div></div>
        </div>
    </div>

    <div class="card" style="width:100%; box-sizing:border-box">
        <h3>Subject Wise Analysis (Chart View)</h3>
        <div style="margin-top:25px">${subjectCharts || '<p>No data recorded for this class.</p>'}</div>
    </div>
  `;
  res.send(layout(`${dept} - HOD Dashboard`, content, dept));
});

/* ================= FACULTY VIEW ================= */
app.get("/faculty", (req, res) => {
  const dept = req.query.dept || "Electrical";
  const subFilter = req.query.subject || "";
  const data = getData({ subject: subFilter });

  let subjectList = [...new Set(timetable.map(t => t.subject))];
  
  let content = `
    <div class="controls">
        <span>Subject Filter:</span>
        <select onchange="location.href='?dept=${dept}&subject='+this.value">
            <option value="">All Subjects</option>
            ${subjectList.map(s => `<option value="${s}" ${subFilter === s ? 'selected' : ''}>${s}</option>`).join("")}
        </select>
    </div>

    <div class="grid" style="margin-bottom:40px">
        <div class="card"><h3>Present Count</h3><h2>${data.present}</h2></div>
        <div class="card"><h3>Total Enrollment</h3><h2>${data.totalStudents}</h2></div>
        <div class="card">
            <h3>Subject Progress</h3>
            <h2 style="color:var(--primary)">${data.percent}%</h2>
            <div class="progress-container"><div class="progress-bar" style="width:${data.percent}%"></div></div>
        </div>
    </div>

    <div class="card">
        <h3>Class Participation (Subject Wise)</h3>
        <table style="width:100%; border-collapse:collapse; margin-top:20px">
            <thead>
                <tr style="text-align:left; color:var(--text-dim)">
                    <th style="padding:12px">Subject Name</th>
                    <th style="padding:12px">Students Present</th>
                    <th style="padding:12px">Total</th>
                    <th style="padding:12px">Status</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(data.subjectWise).map(([s, c]) => `
                    <tr style="border-top:1px solid #334155">
                        <td style="padding:12px">${s}</td>
                        <td style="padding:12px">${c}</td>
                        <td style="padding:12px">60</td>
                        <td style="padding:12px"><span style="background:rgba(16,185,129,0.1); color:var(--accent); padding:4px 10px; border-radius:5px; font-size:0.8rem">Sync Active</span></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
  `;
  res.send(layout(`${dept} - Faculty Dashboard`, content, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
  res.send(`
    <html>
    <body style="background:#020617; color:white; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0">
        <div style="background:#1e293b; padding:40px; border-radius:20px; width:320px; text-align:center; border:1px solid #334155">
            <h2 style="color:#6366f1">RFID Login</h2>
            <input id="n" placeholder="Username" style="width:100%; padding:12px; margin:10px 0; border-radius:10px; background:#0f172a; border:1px solid #334155; color:white;">
            <button onclick="location.href='/principal'" style="width:100%; padding:12px; background:#6366f1; border:none; color:white; border-radius:10px; cursor:pointer; font-weight:bold">Enter Portal</button>
        </div>
    </body>
    </html>
  `);
});

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Server is live at http://localhost:" + PORT));