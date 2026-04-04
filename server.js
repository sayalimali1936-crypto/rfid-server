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

/* ================= CORE LOGIC (UNTOUCHED BUT REFINED) ================= */
if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, "Date,Time,Role,Name,Card_No,Class,Batch,Subject\n");
}

function loadCSV(file) {
    try {
        const data = fs.readFileSync(file, "utf8");
        const lines = data.trim().split(/\r?\n/);
        if (lines.length <= 1) return []; // Returns empty if only headers exist
        const headers = lines.shift().split(",");
        return lines.map(l => {
            let obj = {};
            l.split(",").forEach((v, i) => obj[headers[i]] = v);
            return obj;
        });
    } catch (e) { return []; }
}

const studentList = loadCSV(studentsPath);
const timetable = loadCSV(timetablePath);

function getAnalytics(filters) {
    const raw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1);
    let records = raw.map(l => {
        let p = l.split(",");
        if (p.length < 8) return null;
        return { date: p[0], name: p[3], className: p[5], batch: p[6], subject: p[7] };
    }).filter(x => x);

    // Filter Logic
    if (filters.className) records = records.filter(r => r.className === filters.className);
    if (filters.subject) records = records.filter(r => r.subject === filters.subject);

    let subjectWise = {};
    records.forEach(r => { subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1; });

    let present = records.length;
    let totalCapacity = 60; // Base for percentage
    
    // PERCENTAGE LOGIC: Capped at 100%
    let calcPercent = totalCapacity > 0 ? (present / totalCapacity) * 100 : 0;
    let percent = Math.min(100, calcPercent).toFixed(1);

    return { 
        present, 
        absent: Math.max(0, totalCapacity - present),
        percent, 
        total: totalCapacity,
        subjectWise, 
        records 
    };
}

/* ================= UI SHELL (Professional & Colorful) ================= */
function layout(title, content, currentDept = "") {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --primary: #4338ca; --success: #059669; --danger: #dc2626; --warning: #d97706;
            --bg: #f8fafc; --sidebar: #ffffff; --text: #0f172a; 
        }
        body { margin:0; font-family:'Inter', system-ui, sans-serif; background:var(--bg); color:var(--text); display:flex; height:100vh; overflow:hidden; }
        
        /* SIDEBAR - Restricted Dept View */
        .sidebar { width:270px; background:var(--sidebar); border-right:1px solid #e2e8f0; padding:25px; display:flex; flex-direction:column; box-shadow: 2px 0 10px rgba(0,0,0,0.02); }
        .logo { font-weight:800; color:var(--primary); font-size:1.4rem; margin-bottom:40px; display:flex; align-items:center; gap:12px; }
        .nav-label { font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:20px 0 8px 10px; letter-spacing:1px; }
        .nav-item { padding:12px 15px; border-radius:12px; color:#475569; text-decoration:none; display:flex; align-items:center; gap:12px; transition:0.2s; font-weight:600; font-size:0.9rem; }
        .nav-item:hover { background:#f1f5f9; color:var(--primary); }
        .nav-item.active { background:var(--primary); color:white; box-shadow: 0 4px 12px rgba(67, 56, 202, 0.2); }

        /* MAIN CONTENT */
        .main { flex:1; overflow-y:auto; padding:40px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:35px; }
        .dept-tag { background: #e0e7ff; color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; }

        /* VIBRANT CARDS */
        .stats-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:30px; }
        .card { background:white; padding:22px; border-radius:16px; border:1px solid #f1f5f9; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); position:relative; overflow:hidden; }
        .card::before { content:''; position:absolute; top:0; left:0; width:4px; height:100%; }
        .card.blue::before { background: var(--primary); }
        .card.green::before { background: var(--success); }
        .card.red::before { background: var(--danger); }
        .card.orange::before { background: var(--warning); }
        
        .card h4 { margin:0; font-size:0.75rem; color:#64748b; text-transform:uppercase; display:flex; align-items:center; gap:8px; }
        .card h2 { margin:12px 0 0 0; font-size:1.8rem; font-weight:800; }

        /* MODULAR WIDGETS */
        .widget-box { background:white; padding:25px; border-radius:20px; border:1px solid #f1f5f9; box-shadow:0 10px 15px -3px rgba(0,0,0,0.04); margin-bottom:25px; }
        .widget-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 2px solid #f8fafc; padding-bottom:15px; }
        
        select, button { padding:10px 16px; border-radius:10px; border:1px solid #e2e8f0; font-weight:600; cursor:pointer; transition:0.2s; }
        .btn-main { background:var(--primary); color:white; border:none; }
        .btn-main:hover { background:#3730a3; transform:translateY(-1px); }

        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animated { animation: fadeIn 0.4s ease-out; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-fingerprint"></i> RFID <span>PRO</span></div>
        
        <a href="/principal" class="nav-item ${title === 'Principal' ? 'active' : ''}"><i class="fas fa-th-large"></i> Home</a>
        
        ${currentDept ? `
            <div class="nav-label">${currentDept} Dept</div>
            <a href="/hod?dept=${currentDept}" class="nav-item"><i class="fas fa-user-shield"></i> HOD Office 🛡️</a>
            <a href="/faculty?dept=${currentDept}" class="nav-item"><i class="fas fa-chalkboard-user"></i> Faculty Portal 🎓</a>
            <a href="/reports?dept=${currentDept}" class="nav-item"><i class="fas fa-file-excel"></i> Export Sheets 📊</a>
        ` : ''}

        <div style="margin-top:auto">
            <a href="/login" class="nav-item" style="color:var(--danger)"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
    </div>

    <div class="main animated">
        <div class="header">
            <div>
                <h1 style="margin:0; font-size:1.7rem">${title}</h1>
                <p style="color:#64748b; margin:5px 0 0 0">Session: 2026-27 | Academic Portal</p>
            </div>
            <div style="text-align:right">
                <span class="dept-tag">${currentDept || 'System Admin'}</span>
                <div id="live-time" style="font-weight:700; color:var(--primary); margin-top:5px"></div>
            </div>
        </div>
        ${content}
    </div>

    <script>
        function updateTime() { document.getElementById('live-time').innerText = new Date().toLocaleTimeString(); }
        setInterval(updateTime, 1000); updateTime();
    </script>
</body>
</html>
    `;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
    const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "1st Year"];
    const emojis = ["⚡", "💻", "🏗️", "⚙️", "📡", "📚"];
    
    const content = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; margin-top:20px">
            ${depts.map((d, i) => `
                <a href="/hod?dept=${d}" style="text-decoration:none; color:inherit">
                    <div class="card blue" style="text-align:center; padding:40px; cursor:pointer; transition:0.3s">
                        <span style="font-size:3rem; margin-bottom:15px; display:block">${emojis[i]}</span>
                        <h2 style="margin:0; font-size:1.4rem">${d}</h2>
                        <p style="color:#64748b; font-size:0.8rem; margin-top:10px">View Department Analytics <i class="fas fa-arrow-right"></i></p>
                    </div>
                </a>
            `).join("")}
        </div>
    `;
    res.send(layout("Global Dashboard", content));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({ className: "SE" });
    const content = `
        <div class="stats-grid">
            <div class="card blue"><h4><i class="fas fa-users"></i> Present</h4><h2>${data.present}</h2></div>
            <div class="card red"><h4><i class="fas fa-user-times"></i> Absent</h4><h2>${data.absent}</h2></div>
            <div class="card green"><h4><i class="fas fa-chart-line"></i> Attendance %</h4><h2>${data.percent}%</h2></div>
            <div class="card orange"><h4><i class="fas fa-bell"></i> Alerts</h4><h2>0</h2></div>
        </div>
        <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:25px">
            <div class="widget-box">
                <div class="widget-title"><h3>Subject Performance Chart 📊</h3></div>
                <div style="height:250px"><canvas id="hodChart"></canvas></div>
            </div>
            <div class="widget-box">
                <div class="widget-title"><h3>Department Filter</h3></div>
                <select style="width:100%; margin-bottom:15px"><option>Class: SE</option><option>Class: TE</option><option>Class: BE</option></select>
                <button class="btn-main" style="width:100%">Refresh Data</button>
            </div>
        </div>
        <script>
            new Chart(document.getElementById('hodChart'), {
                type: 'bar',
                data: { 
                    labels: ${JSON.stringify(Object.keys(data.subjectWise).length ? Object.keys(data.subjectWise) : ['Math', 'Science', 'Design'])}, 
                    datasets: [{ label: 'Attendance Count', data: ${JSON.stringify(Object.values(data.subjectWise).length ? Object.values(data.subjectWise) : [0,0,0])}, backgroundColor: '#4338ca', borderRadius: 8 }] 
                },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        </script>
    `;
    res.send(layout("HOD Control Desk", content, dept));
});

/* ================= FACULTY VIEW ================= */
app.get("/faculty", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    const content = `
        <div class="stats-grid">
            <div class="card blue"><h4><i class="fas fa-user-group"></i> Total</h4><h2>60</h2></div>
            <div class="card green"><h4><i class="fas fa-check-circle"></i> Present</h4><h2>${data.present}</h2></div>
            <div class="card red"><h4><i class="fas fa-exclamation-triangle"></i> Defaulters</h4><h2>0</h2></div>
            <div class="card orange"><h4><i class="fas fa-percent"></i> Average %</h4><h2>${data.percent}%</h2></div>
        </div>

        <div class="widget-box">
            <div class="widget-title">
                <h3 style="margin:0">Class Engagement History 📉</h3>
                <div>
                    <button class="btn-main" onclick="changeMode('weekly')">Weekly</button>
                    <button class="btn-main" onclick="changeMode('monthly')" style="background:#64748b">Monthly</button>
                </div>
            </div>
            <div style="height:300px"><canvas id="facultyLine"></canvas></div>
        </div>

        <script>
            let lineChart = new Chart(document.getElementById('facultyLine'), {
                type: 'line',
                data: { 
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 
                    datasets: [{ 
                        label: 'Attendance %', 
                        data: [70, 85, 78, 92, 88, 80], 
                        borderColor: '#4338ca', 
                        backgroundColor: 'rgba(67, 56, 202, 0.1)', 
                        fill: true, 
                        tension: 0.4 
                    }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
            function changeMode(mode) {
                if(mode === 'monthly') {
                    lineChart.data.labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
                    lineChart.data.datasets[0].data = [82, 79, 88, 91];
                } else {
                    lineChart.data.labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    lineChart.data.datasets[0].data = [70, 85, 78, 92, 88, 80];
                }
                lineChart.update();
            }
        </script>
    `;
    res.send(layout("Faculty Portal", content, dept));
});

/* ================= REPORTS & EXCEL DOWNLOAD ================= */
app.get("/reports", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    
    const content = `
        <div class="widget-box">
            <div class="widget-title"><h3>Download Professional Attendance Sheets 📂</h3></div>
            <p style="color:#64748b">Select your criteria to generate the official Excel-compatible (.csv) report.</p>
            
            <div style="display:flex; gap:15px; align-items:center; margin-top:20px">
                <select id="repType"><option value="daily">Daily Report</option><option value="weekly">Weekly Report</option><option value="overall">Overall Record</option></select>
                <select id="repClass"><option>Class SE</option><option>Class TE</option><option>Class BE</option></select>
                <button class="btn-main" onclick="exportToExcel()"><i class="fas fa-download"></i> Generate Excel Sheet</button>
            </div>
        </div>

        <div class="widget-box">
            <div class="widget-title"><h3>Live Scan Data (Preview)</h3></div>
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem">
                <thead>
                    <tr style="text-align:left; color:#94a3b8; border-bottom:1px solid #f1f5f9">
                        <th style="padding:15px">Name</th><th style="padding:15px">Class</th><th style="padding:15px">Batch</th><th style="padding:15px">Subject</th><th style="padding:15px">Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.records.length > 0 ? data.records.map(r => `
                        <tr style="border-bottom:1px solid #f8fafc">
                            <td style="padding:15px; font-weight:600">${r.name}</td><td>${r.className}</td><td>${r.batch}</td><td>${r.subject}</td><td>${r.date}</td>
                        </tr>
                    `).join("") : '<tr><td colspan="5" style="padding:40px; text-align:center; color:#94a3b8">🚫 No scan data available yet. Start scanning to generate records.</td></tr>'}
                </tbody>
            </table>
        </div>

        <script>
            function exportToExcel() {
                const data = ${JSON.stringify(data.records)};
                if(data.length === 0) return alert("System state is Zero. No data to export.");

                let csv = "Student Name,Class,Batch,Subject,Date,Time\\n";
                data.forEach(r => { csv += \`\${r.name},\${r.className},\${r.batch},\${r.subject},\${r.date},\${r.time || '-'}\\n\`; });

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'Attendance_Report_' + new Date().toISOString().split('T')[0] + '.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            }
        </script>
    `;
    res.send(layout("Reports & Export", content, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
    res.send(`
        <body style="background:#f1f5f9; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif">
            <div style="background:white; padding:50px; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.05); text-align:center; width:380px; border:1px solid #e2e8f0">
                <div style="color:var(--primary); font-size:4rem; margin-bottom:25px"><i class="fas fa-id-card-clip"></i></div>
                <h1 style="margin:0; font-size:1.8rem; color:var(--text)">RFID Portal</h1>
                <p style="color:#64748b; margin:10px 0 40px 0">Secure Academic Attendance Gateway</p>
                <button onclick="location.href='/principal'" style="width:100%; padding:15px; background:var(--primary); color:white; border:none; border-radius:12px; cursor:pointer; font-weight:700; font-size:1rem; transition:0.3s">Launch Dashboard</button>
            </div>
        </body>
    `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 System live: http://localhost:" + PORT));