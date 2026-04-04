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
        if (lines.length <= 1) return []; 
        const headers = lines.shift().split(",");
        return lines.map(l => {
            let obj = {};
            l.split(",").forEach((v, i) => obj[headers[i]] = v);
            return obj;
        });
    } catch (e) { return []; }
}

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

    // Subject-wise percentage calculation
    let subjectCounts = {};
    records.forEach(r => { subjectCounts[r.subject] = (subjectCounts[r.subject] || 0) + 1; });
    
    let subjectPercents = {};
    Object.keys(subjectCounts).forEach(s => {
        subjectPercents[s] = Math.min(100, (subjectCounts[s] / 60) * 100).toFixed(1);
    });

    let present = records.length;
    let totalCapacity = 60; 
    let calcPercent = totalCapacity > 0 ? (present / totalCapacity) * 100 : 0;
    let percent = Math.min(100, calcPercent).toFixed(1);

    return { 
        present, 
        absent: Math.max(0, totalCapacity - present),
        percent, 
        total: totalCapacity,
        subjectPercents, 
        records 
    };
}

/* ================= UI SHELL (Professional Aero-Light) ================= */
function layout(title, content, currentDept = "") {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --primary: #4f46e5; --secondary: #6366f1; --success: #10b981; 
            --danger: #ef4444; --warning: #f59e0b; --bg: #f9fafb; --sidebar: #ffffff;
        }
        body { margin:0; font-family:'Inter', sans-serif; background:var(--bg); color:#1f2937; display:flex; height:100vh; overflow:hidden; }
        
        /* SIDEBAR */
        .sidebar { width:260px; background:var(--sidebar); border-right:1px solid #e5e7eb; padding:25px; display:flex; flex-direction:column; box-shadow: 4px 0 10px rgba(0,0,0,0.02); }
        .logo { font-weight:800; color:var(--primary); font-size:1.4rem; margin-bottom:40px; display:flex; align-items:center; gap:10px; letter-spacing:-0.5px; }
        .nav-label { font-size:0.7rem; font-weight:800; color:#9ca3af; text-transform:uppercase; margin:20px 0 8px 10px; letter-spacing:1px; }
        .nav-item { padding:12px 15px; border-radius:12px; color:#4b5563; text-decoration:none; display:flex; align-items:center; gap:12px; transition:0.2s; font-weight:600; font-size:0.9rem; }
        .nav-item:hover { background:#f3f4f6; color:var(--primary); }
        .nav-item.active { background:var(--primary); color:white; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }

        /* MAIN CONTENT */
        .main { flex:1; overflow-y:auto; padding:40px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:35px; }
        .dept-tag { background: #eef2ff; color: var(--primary); padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border: 1px solid #e0e7ff; }

        /* KPI CARDS */
        .stats-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:30px; }
        .card { background:white; padding:25px; border-radius:18px; border:1px solid #f3f4f6; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03); position:relative; }
        .card h4 { margin:0; font-size:0.75rem; color:#6b7280; text-transform:uppercase; display:flex; align-items:center; gap:8px; letter-spacing:0.5px; }
        .card h2 { margin:12px 0 0 0; font-size:1.8rem; font-weight:800; color:#111827; }
        
        .accent-bar { position:absolute; top:0; left:0; width:100%; height:4px; border-radius:18px 18px 0 0; }

        /* WIDGETS */
        .widget-box { background:white; padding:25px; border-radius:20px; border:1px solid #f3f4f6; box-shadow:0 10px 15px -3px rgba(0,0,0,0.04); margin-bottom:25px; }
        .widget-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 2px solid #f9fafb; padding-bottom:15px; }
        
        select, button { padding:10px 16px; border-radius:10px; border:1px solid #e5e7eb; font-weight:600; cursor:pointer; font-size:0.85rem; }
        .btn-indigo { background:var(--primary); color:white; border:none; transition: 0.2s; }
        .btn-indigo:hover { background:#4338ca; transform:translateY(-1px); }

        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animated { animation: fadeIn 0.4s ease-out; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-bolt"></i> RFID DASH</div>
        
        <a href="/principal" class="nav-item ${title === 'Principal' ? 'active' : ''}"><i class="fas fa-home"></i> Home</a>
        
        ${currentDept ? `
            <div class="nav-label">${currentDept} Dept</div>
            <a href="/hod?dept=${currentDept}" class="nav-item"><i class="fas fa-shield-halved"></i> HOD Office 🏢</a>
            <a href="/faculty?dept=${currentDept}" class="nav-item"><i class="fas fa-user-graduate"></i> Faculty Portal 🎓</a>
            <a href="/reports?dept=${currentDept}" class="nav-item"><i class="fas fa-file-csv"></i> Report Center 📊</a>
        ` : ''}

        <div style="margin-top:auto">
            <a href="/login" class="nav-item" style="color:var(--danger)"><i class="fas fa-power-off"></i> Logout</a>
        </div>
    </div>

    <div class="main animated">
        <div class="header">
            <div>
                <h1 style="margin:0; font-size:1.6rem; letter-spacing:-0.5px">${title}</h1>
                <p style="color:#6b7280; margin:5px 0 0 0">RFID Real-Time Monitoring System</p>
            </div>
            <div style="text-align:right">
                <span class="dept-tag">${currentDept || 'System Admin'}</span>
                <div id="live-time" style="font-weight:700; color:var(--primary); margin-top:8px"></div>
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
    const icons = ["fa-bolt", "fa-laptop-code", "fa-trowel-bricks", "fa-gears", "fa-microchip", "fa-book-open"];
    
    const content = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:25px; margin-top:20px">
            ${depts.map((d, i) => `
                <a href="/hod?dept=${d}" style="text-decoration:none; color:inherit">
                    <div class="card" style="text-align:center; padding:45px; cursor:pointer; transition:0.3s">
                        <div class="accent-bar" style="background:var(--primary)"></div>
                        <i class="fas ${icons[i]} fa-3x" style="color:var(--primary); margin-bottom:20px"></i>
                        <h2 style="margin:0; font-size:1.3rem">${d}</h2>
                        <p style="color:#6b7280; font-size:0.8rem; margin-top:10px">Access Local Dashboards <i class="fas fa-chevron-right"></i></p>
                    </div>
                </a>
            `).join("")}
        </div>
    `;
    res.send(layout("Campus Overview", content));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({ className: "SE" });
    const content = `
        <div class="stats-grid">
            <div class="card">
                <div class="accent-bar" style="background:var(--primary)"></div>
                <h4>Present</h4><h2>${data.present}</h2>
            </div>
            <div class="card">
                <div class="accent-bar" style="background:var(--danger)"></div>
                <h4>Absent</h4><h2>${data.absent}</h2>
            </div>
            <div class="card">
                <div class="accent-bar" style="background:var(--success)"></div>
                <h4>Attendance %</h4><h2>${data.percent}%</h2>
            </div>
            <div class="card">
                <div class="accent-bar" style="background:var(--warning)"></div>
                <h4>Class Strength</h4><h2>60</h2>
            </div>
        </div>
        <div class="widget-box">
            <div class="widget-header"><h3>Department Class Comparison 📊</h3></div>
            <div style="height:280px"><canvas id="hodChart"></canvas></div>
        </div>
        <script>
            new Chart(document.getElementById('hodChart'), {
                type: 'bar',
                data: { labels: ['SE', 'TE', 'BE'], datasets: [{ label: 'Avg Attendance %', data: [${data.percent}, 0, 0], backgroundColor: '#4f46e5', borderRadius: 8 }] },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
        </script>
    `;
    res.send(layout("HOD Office", content, dept));
});

/* ================= FACULTY VIEW ================= */
app.get("/faculty", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    
    const content = `
        <div class="stats-grid">
            <div class="card"><div class="accent-bar" style="background:var(--primary)"></div><h4>Lectures</h4><h2>0</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--success)"></div><h4>Present</h4><h2>${data.present}</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--danger)"></div><h4>Absent</h4><h2>${data.absent}</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--warning)"></div><h4>Attendance %</h4><h2>${data.percent}%</h2></div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:25px">
            <div class="widget-box">
                <div class="widget-header"><h3>Subject Wise Attendance % 📈</h3></div>
                <div style="height:250px"><canvas id="subjChart"></canvas></div>
            </div>
            <div class="widget-box">
                <div class="widget-header"><h3>Class History Trend 📉</h3></div>
                <div style="height:250px"><canvas id="trendChart"></canvas></div>
            </div>
        </div>

        <script>
            // Subject Wise Graph
            const subData = ${JSON.stringify(data.subjectPercents)};
            new Chart(document.getElementById('subjChart'), {
                type: 'bar',
                data: { 
                    labels: Object.keys(subData).length ? Object.keys(subData) : ['N/A'], 
                    datasets: [{ label: 'Attendance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#10b981', borderRadius: 6 }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            // Weekly Trend Graph
            new Chart(document.getElementById('trendChart'), {
                type: 'line',
                data: { 
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 
                    datasets: [{ label: 'Class Avg %', data: [0, 0, 0, 0, 0, ${data.percent}], borderColor: '#4f46e5', tension: 0.4, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.05)' }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
        </script>
    `;
    res.send(layout("Faculty Portal", content, dept));
});

/* ================= REPORTS & CSV EXPORT ================= */
app.get("/reports", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    
    const content = `
        <div class="widget-box">
            <div class="widget-header"><h3>Generate Professional Attendance Sheet 📁</h3></div>
            <p style="color:#6b7280; font-size:0.9rem">Generate an Excel-ready CSV report for the selected department session.</p>
            
            <div style="display:flex; gap:15px; align-items:center; margin-top:20px">
                <select id="repType"><option value="daily">Daily Report</option><option value="overall">Overall Record</option></select>
                <button class="btn-indigo" onclick="exportData()"><i class="fas fa-file-excel"></i> Download Excel (.csv)</button>
            </div>
        </div>

        <div class="widget-box">
            <div class="widget-header"><h3>Live Scan Log (Ready for Scanning)</h3></div>
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem">
                <thead>
                    <tr style="text-align:left; color:#9ca3af; border-bottom:1px solid #f3f4f6">
                        <th style="padding:15px">Student Name</th><th style="padding:15px">Class</th><th style="padding:15px">Subject</th><th style="padding:15px">Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.records.length > 0 ? data.records.map(r => `
                        <tr style="border-bottom:1px solid #f9fafb">
                            <td style="padding:15px; font-weight:600">${r.name}</td><td>${r.className}</td><td>${r.subject}</td><td>${r.date}</td>
                        </tr>
                    `).join("") : '<tr><td colspan="4" style="padding:40px; text-align:center; color:#9ca3af">System in Zero-State. Please scan RFID tags to populate data.</td></tr>'}
                </tbody>
            </table>
        </div>

        <script>
            function exportData() {
                const data = ${JSON.stringify(data.records)};
                if(data.length === 0) return alert("System state is currently Zero. No scans found to export.");

                let csv = "Name,Class,Batch,Subject,Date\\n";
                data.forEach(r => { csv += \`\${r.name},\${r.className},\${r.batch},\${r.subject},\${r.date}\\n\`; });

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Attendance_Log_' + new Date().toISOString().split('T')[0] + '.csv';
                document.body.appendChild(a); a.click();
                window.URL.revokeObjectURL(url);
            }
        </script>
    `;
    res.send(layout("Report Center", content, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
    res.send(`
        <body style="background:#f3f4f6; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif">
            <div style="background:white; padding:50px; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.05); text-align:center; width:360px; border:1px solid #e5e7eb">
                <div style="color:var(--primary); font-size:4rem; margin-bottom:25px"><i class="fas fa-user-check"></i></div>
                <h1 style="margin:0; font-size:1.8rem; letter-spacing:-1px">RFID Access</h1>
                <p style="color:#6b7280; margin:10px 0 40px 0; font-weight:500">College Administration Portal</p>
                <button onclick="location.href='/principal'" style="width:100%; padding:15px; background:var(--primary); color:white; border:none; border-radius:12px; cursor:pointer; font-weight:700; font-size:1rem; transition:0.3s">Launch Dashboard</button>
            </div>
        </body>
    `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Server running on http://localhost:" + PORT));