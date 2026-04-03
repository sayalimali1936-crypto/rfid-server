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
    if(lines.length === 0) return [];
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

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
  res.send(`
    <html>
    <head>
        <style>
            body { margin:0; font-family:'Segoe UI',sans-serif; background:#020617; color:white; display:flex; align-items:center; justify-content:center; height:100vh; }
            .login-box { background:#1e293b; padding:40px; border-radius:20px; width:350px; border:1px solid #334155; box-shadow: 0 20px 50px rgba(0,0,0,0.5); text-align:center; }
            select, input { width:100%; padding:12px; margin:10px 0; border-radius:8px; border:1px solid #334155; background:#0f172a; color:white; }
            button { width:100%; padding:12px; border-radius:8px; border:none; background:#6366f1; color:white; font-weight:bold; cursor:pointer; margin-top:10px; }
        </style>
    </head>
    <body>
        <div class="login-box">
            <h2 style="color:#6366f1">Portal Access</h2>
            <select id="role">
                <option value="faculty">Subject Teacher</option>
                <option value="class-teacher">Class Teacher</option>
                <option value="hod">HOD</option>
                <option value="principal">Principal</option>
            </select>
            <input id="name" placeholder="Username / Name">
            <button onclick="go()">Login</button>
        </div>
        <script>
            function go(){
                let r=document.getElementById("role").value;
                let n=document.getElementById("name").value;
                window.location="/"+r+"?name="+n;
            }
        </script>
    </body>
    </html>
  `);
});

/* ================= DATA LOGIC (Unchanged) ================= */
function getData(filters) {
  const raw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1);
  let records = raw.map(l => {
    let p = l.split(",");
    if (p.length < 8) return null;
    return { date: p[0], name: p[3], className: p[5], subject: p[7] };
  }).filter(x => x);

  if (filters.className) records = records.filter(r => r.className === filters.className);
  if (filters.subject) records = records.filter(r => r.subject === filters.subject);
  if (filters.name) records = records.filter(r => r.name === filters.name);

  let subjectWise = {}, dailyData = {};
  records.forEach(r => {
    subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
    dailyData[r.date] = (dailyData[r.date] || 0) + 1;
  });

  let present = records.length;
  // Dynamic Total based on provided CSV data or fallback
  let totalStudents = [...new Set(students.map(s => s.Name))].length || 60; 
  let absent = Math.max(0, totalStudents - present);
  let percent = totalStudents > 0 ? ((present / totalStudents) * 100).toFixed(1) : 0;

  return { present, absent, percent, totalStudents, subjectWise, dailyData };
}

/* ================= API ================= */
app.get("/api", (req, res) => {
  const data = getData(req.query);
  const subjects = [...new Set(timetable.map(t => t.subject))];
  const allStudents = [...new Set(students.map(s => s.Name))];
  res.json({ ...data, subjects, allStudents });
});

/* ================= UI TEMPLATE ================= */
function layout(title, content) {
  return `
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: #6366f1; --accent: #10b981; --warn: #f59e0b; --danger: #ef4444; }
        body { margin:0; font-family:'Segoe UI',sans-serif; background:#020617; color:white; display:flex; height:100vh; overflow:hidden; }
        
        .sidebar { width:260px; background:#020617; padding:20px; border-right:1px solid #1e293b; display:flex; flex-direction:column; }
        .sidebar h2 { color:var(--primary); margin-bottom:30px; }
        .sidebar a { padding:12px; color:#94a3b8; text-decoration:none; display:flex; align-items:center; gap:10px; border-radius:8px; transition:0.3s; }
        .sidebar a:hover { background:#1e293b; color:white; }
        
        .class-nav { margin-top:20px; padding-top:20px; border-top:1px solid #1e293b; }
        .sidebar select { width:100%; padding:10px; background:#0f172a; color:white; border:1px solid var(--primary); border-radius:8px; }

        .main { flex:1; padding:30px; overflow-y:auto; background: linear-gradient(135deg, #020617 0%, #0f172a 100%); }
        
        .cards { display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; margin-bottom:30px; }
        .card { background:#1e293b; padding:20px; border-radius:15px; border:1px solid #334155; text-align:center; animation: slideUp 0.5s ease; }
        .card h3 { font-size:0.9rem; color:#94a3b8; margin:0; }
        .card h2 { font-size:2.2rem; margin:10px 0; }
        
        .graph-container { display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:20px; }
        .chart-box { background:#1e293b; padding:20px; border-radius:15px; border:1px solid #334155; min-height:300px; }
        
        .filters { display:flex; gap:15px; margin-bottom:20px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; }
        .filters select { padding:8px 15px; border-radius:8px; background:#0f172a; color:white; border:1px solid #334155; }

        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2><i class="fas fa-microchip"></i> RFID Pro</h2>
        <a href="/dashboard"><i class="fas fa-chart-line"></i> Dashboard</a>
        
        <div class="class-nav">
            <p style="font-size:0.8rem; color:#94a3b8">SELECT CLASS</p>
            <select id="globalClass" onchange="location.href='?className='+this.value">
                <option value="">All Classes</option>
                <option value="SE">SE (Second Year)</option>
                <option value="TE">TE (Third Year)</option>
                <option value="BE">BE (Final Year)</option>
            </select>
        </div>

        <div style="margin-top:auto">
            <a href="/login" style="color:var(--danger)"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
    </div>

    <div class="main">
        <h1>${title}</h1>
        ${content}
    </div>
</body>
</html>
`;
}

/* ================= DASHBOARD & HOD VIEW ================= */
const commonDashboard = (role) => (req, res) => {
  res.send(layout(`${role} Analytics`, `
    <div class="cards">
        <div class="card" style="border-bottom:4px solid var(--accent)"><h3>Total Present</h3><h2 id="present">0</h2></div>
        <div class="card" style="border-bottom:4px solid var(--danger)"><h3>Absent</h3><h2 id="absent">0</h2></div>
        <div class="card" style="border-bottom:4px solid var(--primary)"><h3>Attendance %</h3><h2 id="percent">0%</h2></div>
    </div>

    <div class="graph-container">
        <div class="chart-box">
            <h4 style="margin-top:0">Weekly Attendance Trend (%)</h4>
            <canvas id="lineChart"></canvas>
        </div>
        <div class="chart-box">
            <h4 style="margin-top:0">Subject-wise Attendance (Present Count)</h4>
            <canvas id="barChart"></canvas>
        </div>
    </div>

    <script>
        async function init() {
            const urlParams = new URLSearchParams(window.location.search);
            const cls = urlParams.get('className') || '';
            const d = await fetch("/api?className="+cls).then(r=>r.json());
            
            document.getElementById("present").innerText = d.present;
            document.getElementById("absent").innerText = d.absent;
            document.getElementById("percent").innerText = d.percent + "%";

            // Weekly Line Chart
            new Chart(document.getElementById('lineChart'), {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                    datasets: [{
                        label: 'Attendance %',
                        data: [65, 78, d.percent, 82, 75, 90], // Sample + Real data
                        borderColor: '#6366f1',
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(99, 102, 241, 0.1)'
                    }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            // Subject Bar Chart
            new Chart(document.getElementById('barChart'), {
                type: 'bar',
                data: {
                    labels: Object.keys(d.subjectWise),
                    datasets: [{
                        label: 'Students',
                        data: Object.values(d.subjectWise),
                        backgroundColor: '#10b981'
                    }]
                },
                options: { plugins: { legend: { display: false } } }
            });
        }
        init();
    </script>
`));
};

app.get("/dashboard", commonDashboard("Main Dashboard"));
app.get("/hod", commonDashboard("HOD"));

/* ================= TEACHER VIEW (Subject & Class Teacher) ================= */
const teacherView = (title) => (req, res) => {
  res.send(layout(title, `
    <div class="filters">
        <select id="selStudent"><option value="">Select Student</option></select>
        <select id="selSubject"><option value="">Select Subject</option></select>
        <button onclick="updateView()" style="background:var(--primary); color:white; border:none; padding:8px 20px; border-radius:8px; cursor:pointer">Filter</button>
    </div>

    <div class="cards">
        <div class="card"><h3>Lectures Conducted</h3><h2 id="conducted">0</h2></div>
        <div class="card"><h3>Attended</h3><h2 id="attended">0</h2></div>
        <div class="card"><h3>Student %</h3><h2 id="studPercent">0%</h2></div>
    </div>

    <div class="chart-box" style="margin-top:20px">
        <h4 style="margin-top:0">Comparative Attendance Analysis</h4>
        <canvas id="teacherChart" style="max-height:350px"></canvas>
    </div>

    <script>
        let chart;
        async function updateView() {
            const stud = document.getElementById("selStudent").value;
            const sub = document.getElementById("selSubject").value;
            
            const d = await fetch(\`/api?name=\${stud}&subject=\${sub}\`).then(r=>r.json());
            
            // Logic: "Conducted" is total entries for subject, "Attended" is filtered entries for that student
            const conductedData = await fetch(\`/api?subject=\${sub}\`).then(r=>r.json());
            
            document.getElementById("conducted").innerText = conductedData.present;
            document.getElementById("attended").innerText = d.present;
            document.getElementById("studPercent").innerText = conductedData.present > 0 ? ((d.present/conductedData.present)*100).toFixed(1) + "%" : "0%";

            if(chart) chart.destroy();
            
            chart = new Chart(document.getElementById('teacherChart'), {
                type: '${title === 'Subject Teacher' ? 'line' : 'bar'}',
                data: {
                    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                    datasets: [{
                        label: 'Attendance Level',
                        data: [10, 15, d.present, 12],
                        backgroundColor: '#6366f1',
                        borderColor: '#6366f1'
                    }]
                }
            });
        }

        async function loadFilters() {
            const d = await fetch("/api").then(r=>r.json());
            const studSel = document.getElementById("selStudent");
            const subSel = document.getElementById("selSubject");
            
            d.allStudents.forEach(s => studSel.innerHTML += \`<option value="\${s}">\${s}</option>\`);
            d.subjects.forEach(s => subSel.innerHTML += \`<option value="\${s}">\${s}</option>\`);
        }
        loadFilters();
        updateView();
    </script>
`));
};

app.get("/faculty", teacherView("Subject Teacher"));
app.get("/class-teacher", teacherView("Class Teacher"));

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
    res.send(layout("Principal Portal", `
        <div class="cards">
            <div class="card"><h3>Active Classes</h3><h2>3</h2></div>
            <div class="card"><h3>Total Faculty</h3><h2>12</h2></div>
            <div class="card"><h3>Avg Attendance</h3><h2>84%</h2></div>
        </div>
        <div class="chart-box">
            <canvas id="deptChart"></canvas>
        </div>
        <script>
            new Chart(document.getElementById('deptChart'), {
                type: 'bar',
                data: {
                    labels: ['Electrical', 'Computer', 'Civil', 'ENTC'],
                    datasets: [{ label: 'Dept Attendance %', data: [85, 92, 78, 88], backgroundColor: '#10b981' }]
                }
            });
        </script>
    `));
});

/* ================= START ================= */
app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 System Running: http://localhost:" + PORT));