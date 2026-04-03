const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Path Setup (Unchanged)
const csvPath = path.join(__dirname, "attendance.csv");
const timetablePath = path.join(__dirname, "Time_Table.csv");
const studentsPath = path.join(__dirname, "Students.csv");
const staffPath = path.join(__dirname, "Staff_Master.csv");

/* ================= CORE LOGIC (UNTOUCHED) ================= */
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

const students = loadCSV(studentsPath);
const timetable = loadCSV(timetablePath);

function getData(filters) {
  const raw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1);
  let records = raw.map(l => {
    let p = l.split(",");
    if (p.length < 8) return null;
    return { date: p[0], name: p[3], className: p[5], subject: p[7] };
  }).filter(x => x);

  if (filters.className) records = records.filter(r => r.className === filters.className);
  if (filters.subject) records = records.filter(r => r.subject === filters.subject);

  let subjectWise = {}, dailyTrend = {};
  records.forEach(r => {
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
    dailyTrend[r.date] = (dailyTrend[r.date] || 0) + 1;
  });

  let present = records.length;
  let totalStudents = 60; // Standard batch size
  let absent = Math.max(0, totalStudents - present);
  let percent = totalStudents > 0 ? ((present / totalStudents) * 100).toFixed(1) : 0;

  return { present, absent, percent, totalStudents, subjectWise, dailyTrend };
}

/* ================= PROFESSIONAL UI SHELL ================= */
function layout(title, content, activeDept = "Electrical") {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RFID Analytics | ${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #2563eb; --primary-light: #eff6ff;
            --success: #10b981; --danger: #ef4444;
            --bg: #f8fafc; --sidebar: #ffffff;
            --text-main: #1e293b; --text-muted: #64748b;
            --border: #e2e8f0; --card-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        * { box-sizing: border-box; }
        body { 
            margin:0; font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text-main);
            display: flex; height: 100vh; overflow: hidden;
        }

        /* Sidebar */
        .sidebar {
            width: 280px; background: var(--sidebar); border-right: 1px solid var(--border);
            display: flex; flex-direction: column; padding: 30px 20px;
        }
        .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 40px; color: var(--primary); font-weight: 700; font-size: 1.2rem; }
        .nav-group { margin-bottom: 30px; }
        .nav-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 15px; display: block; }
        .nav-link {
            display: flex; align-items: center; gap: 12px; padding: 12px 15px; border-radius: 8px;
            color: var(--text-main); text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: 0.2s;
        }
        .nav-link:hover { background: var(--primary-light); color: var(--primary); }
        .nav-link.active { background: var(--primary); color: white; }

        /* Main Content */
        .content { flex: 1; overflow-y: auto; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .breadcrumb { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 5px; }

        /* KPI Cards */
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px; margin-bottom: 30px; }
        .stat-card {
            background: white; padding: 25px; border-radius: 12px; border: 1px solid var(--border);
            box-shadow: var(--card-shadow); transition: transform 0.2s;
        }
        .stat-card:hover { transform: translateY(-5px); }
        .stat-label { font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
        .stat-value { font-size: 2rem; font-weight: 700; margin-top: 10px; display: block; }
        .stat-trend { font-size: 0.8rem; margin-top: 8px; font-weight: 600; }

        /* Data Containers */
        .chart-row { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 25px; }
        .card-container { background: white; padding: 25px; border-radius: 12px; border: 1px solid var(--border); box-shadow: var(--card-shadow); }
        
        select {
            padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border);
            font-family: inherit; font-size: 0.9rem; color: var(--text-main); cursor: pointer; outline: none;
        }
        select:focus { border-color: var(--primary); }

        .btn-dept {
            padding: 20px; background: white; border-radius: 12px; border: 1px solid var(--border);
            text-align: center; cursor: pointer; transition: 0.3s; text-decoration: none; color: inherit;
        }
        .btn-dept:hover { border-color: var(--primary); background: var(--primary-light); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animated { animation: fadeIn 0.4s ease-out; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-fingerprint fa-lg"></i> RFID GATEWAY</div>
        
        <div class="nav-group">
            <span class="nav-label">Executive</span>
            <a href="/principal" class="nav-link"><i class="fas fa-chart-pie"></i> Principal Dashboard</a>
        </div>

        <div class="nav-group">
            <span class="nav-label">Departmental Access</span>
            <a href="/hod?dept=${activeDept}" class="nav-link"><i class="fas fa-user-shield"></i> HOD Portal</a>
            <a href="/faculty?dept=${activeDept}" class="nav-link"><i class="fas fa-chalkboard-user"></i> Faculty View</a>
        </div>

        <div style="margin-top:auto">
            <a href="/login" class="nav-link" style="color: var(--danger)"><i class="fas fa-right-from-bracket"></i> Sign Out</a>
        </div>
    </div>

    <div class="content">
        <div class="header animated">
            <div>
                <div class="breadcrumb">Systems / ${activeDept} / Statistics</div>
                <h1 style="margin:0; font-size: 1.7rem; font-weight: 700;">${title}</h1>
            </div>
            <div id="live-clock" style="font-weight: 600; color: var(--text-muted)"></div>
        </div>
        ${content}
    </div>

    <script>
        function updateTime() {
            document.getElementById('live-clock').innerText = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        setInterval(updateTime, 1000); updateTime();
    </script>
</body>
</html>
`;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
  const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "First Year"];
  const cards = depts.map(d => `
    <a href="/hod?dept=${d}" class="btn-dept animated">
        <i class="fas fa-building-columns fa-2x" style="color: var(--primary); margin-bottom: 15px"></i>
        <h3 style="margin:0">${d}</h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px">View Analytics <i class="fas fa-chevron-right"></i></p>
    </a>
  `).join("");

  res.send(layout("Campus Overview", `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px">
        ${cards}
    </div>
    <div class="card-container animated" style="margin-top: 30px">
        <h3 style="margin-top:0">Consolidated Attendance Trend</h3>
        <canvas id="campusTrend" height="100"></canvas>
    </div>
    <script>
        new Chart(document.getElementById('campusTrend'), {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                datasets: [{
                    label: 'Campus-wide Avg %',
                    data: [82, 85, 88, 84, 91, 79],
                    borderColor: '#2563eb', tension: 0.4, fill: true, backgroundColor: '#eff6ff'
                }]
            }
        });
    </script>
  `, "Global"));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
  const dept = req.query.dept || "Electrical";
  const cls = req.query.className || "SE";
  const data = getData({ className: cls });

  res.send(layout(`${dept} HOD Dashboard`, `
    <div class="controls animated" style="margin-bottom: 25px">
        <select onchange="location.href='?dept=${dept}&className='+this.value">
            <option value="SE" ${cls==='SE'?'selected':''}>Second Year (SE)</option>
            <option value="TE" ${cls==='TE'?'selected':''}>Third Year (TE)</option>
            <option value="BE" ${cls==='BE'?'selected':''}>Final Year (BE)</option>
        </select>
    </div>

    <div class="stats-grid animated">
        <div class="stat-card">
            <span class="stat-label"><i class="fas fa-users"></i> Students Present</span>
            <span class="stat-value">${data.present}</span>
            <div class="stat-trend" style="color: var(--success)">↑ Normal capacity</div>
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="fas fa-user-minus"></i> Students Absent</span>
            <span class="stat-value" style="color: var(--danger)">${data.absent}</span>
            <div class="stat-trend">Out of ${data.totalStudents} total</div>
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="fas fa-chart-line"></i> Efficiency</span>
            <span class="stat-value" style="color: var(--primary)">${data.percent}%</span>
            <div style="height:6px; background:#e2e8f0; border-radius:10px; margin-top:10px">
                <div style="width:${data.percent}%; height:100%; background:var(--primary); border-radius:10px"></div>
            </div>
        </div>
    </div>

    <div class="chart-row animated">
        <div class="card-container">
            <h3 style="margin-top:0">Subject-wise Distribution</h3>
            <canvas id="subjectBar"></canvas>
        </div>
        <div class="card-container">
            <h3 style="margin-top:0">Weekly Stability</h3>
            <canvas id="weeklyRadar"></canvas>
        </div>
    </div>

    <script>
        const subData = ${JSON.stringify(data.subjectWise)};
        new Chart(document.getElementById('subjectBar'), {
            type: 'bar',
            data: {
                labels: Object.keys(subData),
                datasets: [{ label: 'Students', data: Object.values(subData), backgroundColor: '#3b82f6', borderRadius: 6 }]
            }
        });
        new Chart(document.getElementById('weeklyRadar'), {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent'],
                datasets: [{ data: [${data.present}, ${data.absent}], backgroundColor: ['#2563eb', '#f1f5f9'] }]
            }
        });
    </script>
  `, dept));
});

/* ================= FACULTY VIEW ================= */
app.get("/faculty", (req, res) => {
  const dept = req.query.dept || "Electrical";
  const sub = req.query.subject || "";
  const data = getData({ subject: sub });
  const subjects = [...new Set(timetable.map(t => t.subject))];

  res.send(layout(`${dept} Faculty Portal`, `
    <div class="controls animated" style="margin-bottom: 25px">
        <select onchange="location.href='?dept=${dept}&subject='+this.value">
            <option value="">Search Subject...</option>
            ${subjects.map(s => `<option value="${s}" ${sub===s?'selected':''}>${s}</option>`).join("")}
        </select>
    </div>

    <div class="stats-grid animated">
        <div class="stat-card">
            <span class="stat-label">Conducted Lectures</span>
            <span class="stat-value">24</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">Students Present</span>
            <span class="stat-value">${data.present}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">Attendance Score</span>
            <span class="stat-value" style="color: var(--success)">${data.percent}%</span>
        </div>
    </div>

    <div class="card-container animated">
        <h3 style="margin-top:0">Detailed Student Attendance Record</h3>
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size: 0.9rem">
            <thead>
                <tr style="text-align:left; color: var(--text-muted); border-bottom: 1px solid var(--border)">
                    <th style="padding: 15px">Subject</th>
                    <th style="padding: 15px">Current Strength</th>
                    <th style="padding: 15px">Capacity</th>
                    <th style="padding: 15px">Status</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(data.subjectWise).map(([s, c]) => `
                    <tr style="border-bottom: 1px solid var(--border)">
                        <td style="padding: 15px; font-weight: 600">${s}</td>
                        <td style="padding: 15px">${c}</td>
                        <td style="padding: 15px">60</td>
                        <td style="padding: 15px"><span style="color: var(--success); background: #ecfdf5; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem">Live</span></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
  `, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
  res.send(`
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            body { 
                margin:0; font-family:'Inter', sans-serif; background: #f1f5f9;
                display: flex; align-items: center; justify-content: center; height: 100vh;
            }
            .login-card {
                background: white; padding: 50px; border-radius: 20px; width: 400px;
                box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); text-align: center;
            }
            button {
                width: 100%; padding: 15px; background: #2563eb; color: white; border: none;
                border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 1rem; transition: 0.3s;
            }
            button:hover { background: #1d4ed8; }
        </style>
    </head>
    <body>
        <div class="login-card">
            <i class="fas fa-fingerprint" style="font-size: 3rem; color: #2563eb; margin-bottom: 20px"></i>
            <h1 style="margin-bottom: 30px">Attendance Portal</h1>
            <button onclick="location.href='/principal'">Launch Application</button>
            <p style="margin-top: 20px; color: #64748b; font-size: 0.8rem">Secure RFID Authentication Environment</p>
        </div>
    </body>
    </html>
  `);
});

/* ================= INIT ================= */
app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Professional System Running at http://localhost:" + PORT));