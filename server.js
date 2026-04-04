const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

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
        if (lines.length <= 1) return [];
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

function getAnalytics(filters) {
    // For now, returning empty/default if data is being cleared for scanning
    const raw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1);
    let records = raw.map(l => {
        let p = l.split(",");
        if (p.length < 8) return null;
        return { date: p[0], name: p[3], className: p[5], batch: p[6], subject: p[7] };
    }).filter(x => x);

    if (filters.className) records = records.filter(r => r.className === filters.className);
    if (filters.subject) records = records.filter(r => r.subject === filters.subject);

    let subjectWise = {};
    records.forEach(r => { subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1; });

    let present = records.length;
    let total = 60; 
    return { 
        present, total, percent: ((present / total) * 100).toFixed(1), 
        subjectWise, records 
    };
}

/* ================= UI SHELL (Professional Light) ================= */
function layout(title, content, currentDept = "", role = "Guest") {
    return `
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: #2563eb; --success: #10b981; --bg: #f1f5f9; --sidebar: #ffffff; --text: #1e293b; }
        body { margin:0; font-family:'Segoe UI', sans-serif; background:var(--bg); color:var(--text); display:flex; height:100vh; overflow:hidden; }
        
        /* SIDEBAR - Contextual Navigation */
        .sidebar { width:260px; background:var(--sidebar); border-right:1px solid #e2e8f0; padding:25px; display:flex; flex-direction:column; gap:5px; }
        .logo { font-weight:800; color:var(--primary); font-size:1.4rem; margin-bottom:35px; display:flex; align-items:center; gap:10px; }
        .nav-label { font-size:0.7rem; font-weight:700; color:#94a3b8; text-transform:uppercase; margin:15px 0 5px 10px; }
        .nav-item { padding:12px 15px; border-radius:10px; color:#64748b; text-decoration:none; display:flex; align-items:center; gap:12px; transition:0.3s; font-weight:500; }
        .nav-item:hover, .nav-item.active { background:#eff6ff; color:var(--primary); }
        .nav-item i { width:20px; }

        /* MAIN CONTENT */
        .main { flex:1; overflow-y:auto; padding:40px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; }
        
        /* COMPACT WIDGETS */
        .stats-row { display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:25px; }
        .stat-card { background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
        .stat-card h4 { margin:0; font-size:0.75rem; color:#64748b; text-transform:uppercase; }
        .stat-card h2 { margin:10px 0 0 0; font-size:1.6rem; color:var(--text); }

        .widget-row { display:grid; grid-template-columns: 1.5fr 1fr; gap:25px; }
        .widget { background:white; padding:20px; border-radius:15px; border:1px solid #e2e8f0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); }
        .widget h3 { margin-top:0; font-size:1rem; border-bottom:1px solid #f1f5f9; padding-bottom:10px; margin-bottom:15px; }

        /* DOWNLOAD FORM */
        .report-form { display:flex; gap:10px; align-items:center; margin-top:10px; }
        select, button { padding:8px 15px; border-radius:8px; border:1px solid #cbd5e1; outline:none; }
        .btn-primary { background:var(--primary); color:white; border:none; cursor:pointer; }

        @keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
        .animated { animation: slideIn 0.4s ease forwards; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-fingerprint"></i> RFID Pro</div>
        
        <a href="/principal" class="nav-item ${title === 'Principal' ? 'active' : ''}"><i class="fas fa-city"></i> Principal</a>
        
        ${currentDept ? `
            <div class="nav-label">${currentDept} DEPT</div>
            <a href="/hod?dept=${currentDept}" class="nav-item"><i class="fas fa-user-shield"></i> HOD Office</a>
            <a href="/faculty?dept=${currentDept}" class="nav-item"><i class="fas fa-chalkboard-user"></i> Faculty Portal</a>
            <a href="/reports?dept=${currentDept}" class="nav-item"><i class="fas fa-file-excel"></i> Reports & Export</a>
        ` : ''}

        <div style="margin-top:auto">
            <a href="/login" class="nav-item" style="color:#ef4444"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
    </div>

    <div class="main">
        <div class="header">
            <h1 style="font-size:1.5rem; margin:0">${title} ${currentDept ? `- ${currentDept}` : ''}</h1>
            <div id="clock" style="font-weight:600; color:var(--primary)"></div>
        </div>
        <div class="animated">${content}</div>
    </div>

    <script>
        function updateClock() { document.getElementById('clock').innerText = new Date().toLocaleTimeString(); }
        setInterval(updateClock, 1000); updateClock();
    </script>
</body>
</html>
    `;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
    const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "1st Year"];
    const content = `
        <p style="color:#64748b; margin-bottom:25px">Select a department to view specific faculty and HOD analytics.</p>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px">
            ${depts.map(d => `
                <a href="/hod?dept=${d}" style="text-decoration:none; color:inherit">
                    <div class="stat-card" style="text-align:center; padding:30px; cursor:pointer">
                        <i class="fas fa-building fa-2x" style="color:var(--primary); margin-bottom:15px"></i>
                        <h3 style="margin:0">${d}</h3>
                    </div>
                </a>
            `).join("")}
        </div>
    `;
    res.send(layout("Principal Dashboard", content));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
    const dept = req.query.dept || "";
    const data = getAnalytics({ className: "SE" }); // Default view
    const content = `
        <div class="stats-row">
            <div class="stat-card"><h4>Present</h4><h2>${data.present}</h2></div>
            <div class="stat-card"><h4>Absent</h4><h2>${data.total - data.present}</h2></div>
            <div class="stat-card"><h4>Attendance %</h4><h2 style="color:var(--primary)">${data.percent}%</h2></div>
            <div class="stat-card"><h4>Status</h4><h2 style="color:var(--success)">Active</h2></div>
        </div>
        <div class="widget-row">
            <div class="widget">
                <h3>Daily Subject Performance</h3>
                <canvas id="hodChart" height="150"></canvas>
            </div>
            <div class="widget">
                <h3>Quick Controls</h3>
                <p>Filter Class:</p>
                <select style="width:100%"><option>SE</option><option>TE</option><option>BE</option></select>
            </div>
        </div>
        <script>
            new Chart(document.getElementById('hodChart'), {
                type: 'bar',
                data: { labels: ['Math', 'Physics', 'Design'], datasets: [{ label: 'Present', data: [45, 38, 52], backgroundColor: '#2563eb' }] },
                options: { plugins: { legend: { display: false } } }
            });
        </script>
    `;
    res.send(layout("HOD Control Desk", content, dept));
});

/* ================= FACULTY VIEW ================= */
app.get("/faculty", (req, res) => {
    const dept = req.query.dept || "";
    const data = getAnalytics({});
    const content = `
        <div class="stats-row">
            <div class="stat-card"><h4>Class Count</h4><h2>60</h2></div>
            <div class="stat-card"><h4>Currently In</h4><h2>${data.present}</h2></div>
            <div class="stat-card"><h4>Defaulters</h4><h2 style="color:#ef4444">0</h2></div>
            <div class="stat-card"><h4>Today %</h4><h2>${data.percent}%</h2></div>
        </div>

        <div class="widget">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px">
                <h3 style="margin:0; border:none">Class Attendance Analytics</h3>
                <div>
                    <button class="btn-primary" onclick="updateChart('weekly')">Weekly</button>
                    <button class="btn-primary" onclick="updateChart('monthly')" style="background:#64748b">Monthly</button>
                </div>
            </div>
            <div style="height:250px"><canvas id="facChart"></canvas></div>
        </div>

        <script>
            let chart = new Chart(document.getElementById('facChart'), {
                type: 'line',
                data: { 
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 
                    datasets: [{ label: 'Attendance %', data: [70, 85, 78, 92, 88, 80], borderColor: '#2563eb', tension: 0.3, fill: true, backgroundColor: 'rgba(37, 99, 235, 0.1)' }] 
                },
                options: { maintainAspectRatio: false }
            });
            function updateChart(mode) {
                if(mode === 'monthly') {
                    chart.data.labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
                    chart.data.datasets[0].data = [82, 79, 88, 91];
                } else {
                    chart.data.labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    chart.data.datasets[0].data = [70, 85, 78, 92, 88, 80];
                }
                chart.update();
            }
        </script>
    `;
    res.send(layout("Faculty Dashboard", content, dept));
});

/* ================= REPORTS & EXCEL EXPORT ================= */
app.get("/reports", (req, res) => {
    const dept = req.query.dept || "";
    const data = getAnalytics({}); // Get actual records for export
    
    const content = `
        <div class="widget">
            <h3>Attendance Report Generator</h3>
            <p style="color:#64748b">Generate and download official attendance sheets in Excel (.csv) format.</p>
            
            <div class="report-form">
                <select id="reportType">
                    <option value="daily">Daily Report</option>
                    <option value="weekly">Weekly Summary</option>
                    <option value="overall">Overall Attendance</option>
                </select>
                <select id="repClass"><option>SE</option><option>TE</option><option>BE</option></select>
                <button class="btn-primary" onclick="downloadReport()"><i class="fas fa-download"></i> Generate Excel</button>
            </div>
        </div>

        <div class="widget" style="margin-top:25px">
            <h3>Preview (Recent Scans)</h3>
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem">
                <tr style="text-align:left; color:#64748b; border-bottom:1px solid #f1f5f9">
                    <th style="padding:10px">Student Name</th>
                    <th style="padding:10px">Class</th>
                    <th style="padding:10px">Batch</th>
                    <th style="padding:10px">Subject</th>
                </tr>
                ${data.records.length > 0 ? data.records.map(r => `
                    <tr><td style="padding:10px">${r.name}</td><td>${r.className}</td><td>${r.batch}</td><td>${r.subject}</td></tr>
                `).join("") : '<tr><td colspan="4" style="padding:20px; text-align:center; color:#94a3b8">No records found. Start scanning to see data.</td></tr>'}
            </table>
        </div>

        <script>
            function downloadReport() {
                const records = ${JSON.stringify(data.records)};
                if(records.length === 0) return alert("No data available to export!");

                let csv = "Student Name,Class,Batch,Subject,Date\\n";
                records.forEach(r => {
                    csv += \`\${r.name},\${r.className},\${r.batch},\${r.subject},\${r.date}\\n\`;
                });

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.setAttribute('hidden', '');
                a.setAttribute('href', url);
                a.setAttribute('download', 'Attendance_Report_' + new Date().toLocaleDateString() + '.csv');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        </script>
    `;
    res.send(layout("Reports Center", content, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
    res.send(`
        <body style="background:var(--bg); display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif">
            <div style="background:white; padding:50px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.05); text-align:center; width:350px">
                <i class="fas fa-fingerprint fa-3x" style="color:var(--primary); margin-bottom:20px"></i>
                <h2 style="margin:0">College RFID Portal</h2>
                <p style="color:#64748b; margin-bottom:30px">Centralized Attendance System</p>
                <button onclick="location.href='/principal'" style="width:100%; padding:14px; background:var(--primary); color:white; border:none; border-radius:10px; cursor:pointer; font-weight:700">Enter System</button>
            </div>
        </body>
    `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Server: http://localhost:" + PORT));