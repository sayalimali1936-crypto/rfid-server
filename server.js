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

    if (filters.className) records = records.filter(r => r.className === filters.className);
    if (filters.subject) records = records.filter(r => r.subject === filters.subject);
    if (filters.studentName) {
        records = records.filter(r => r.name.toLowerCase().includes(filters.studentName.toLowerCase()));
    }

    let subjectCounts = {};
    records.forEach(r => { subjectCounts[r.subject] = (subjectCounts[r.subject] || 0) + 1; });
    
    let subjectPercents = {};
    Object.keys(subjectCounts).forEach(s => {
        subjectPercents[s] = Math.min(100, (subjectCounts[s] / 60) * 100).toFixed(1);
    });

    let present = records.length;
    let totalCapacity = 60; 
    let percent = Math.min(100, (present / totalCapacity) * 100).toFixed(1);

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
            --primary: #4f46e5; --success: #10b981; --danger: #f43f5e; 
            --warning: #f59e0b; --bg: #f8fafc; --sidebar: #ffffff;
        }
        body { margin:0; font-family:'Inter', sans-serif; background:var(--bg); color:#1e293b; display:flex; height:100vh; overflow:hidden; }
        
        .sidebar { width:270px; background:var(--sidebar); border-right:1px solid #e5e7eb; padding:30px 20px; display:flex; flex-direction:column; box-shadow: 2px 0 10px rgba(0,0,0,0.02); }
        .logo { font-weight:800; color:var(--primary); font-size:1.3rem; margin-bottom:40px; display:flex; align-items:center; gap:10px; }
        .nav-label { font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:20px 0 8px 10px; }
        .nav-item { padding:12px 15px; border-radius:12px; color:#64748b; text-decoration:none; display:flex; align-items:center; gap:12px; transition:0.2s; font-weight:600; font-size:0.9rem; }
        .nav-item:hover, .nav-item.active { background:#f1f5f9; color:var(--primary); }
        .nav-item.active { background:var(--primary); color:white; }

        .main { flex:1; overflow-y:auto; padding:35px; scroll-behavior: smooth; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; }
        .dept-tag { background: #eef2ff; color: var(--primary); padding: 5px 15px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border:1px solid #e0e7ff; }

        /* KPI CARDS */
        .stats-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:25px; }
        .card { background:white; padding:22px; border-radius:18px; border:1px solid #f1f5f9; position:relative; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
        .card h4 { margin:0; font-size:0.7rem; color:#94a3b8; text-transform:uppercase; display:flex; align-items:center; gap:8px; }
        .card h2 { margin:10px 0 0 0; font-size:1.7rem; font-weight:800; }
        .accent-bar { position:absolute; top:0; left:0; width:100%; height:4px; border-radius:18px 18px 0 0; }

        /* FILTER TOOLBAR */
        .toolbar { background:white; padding:15px 25px; border-radius:15px; border:1px solid #f1f5f9; display:flex; gap:15px; align-items:center; margin-bottom:25px; }
        select, input { padding:10px 15px; border-radius:10px; border:1px solid #e2e8f0; font-weight:600; outline:none; font-size:0.85rem; }
        .search-box { flex:1; display:flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0 15px; }
        .search-box input { border:none; background:transparent; width:100%; padding:10px 5px; }

        .widget { background:white; padding:25px; border-radius:20px; border:1px solid #f1f5f9; box-shadow:0 4px 10px rgba(0,0,0,0.02); }
        .btn-toggle { padding:6px 15px; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer; font-weight:600; font-size:0.8rem; background:white; }
        .btn-toggle.active { background:var(--primary); color:white; border-color:var(--primary); }

        .footer-tiny { margin-top:auto; font-size:0.6rem; color:#cbd5e1; text-align:center; letter-spacing:1px; text-transform:uppercase; }
        .animated { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-grid-2"></i> PORTAL</div>
        <a href="/principal" class="nav-item ${title === 'Principal' ? 'active' : ''}"><i class="fas fa-building"></i> Principal Home</a>
        ${currentDept ? `
            <div class="nav-label">${currentDept}</div>
            <a href="/hod?dept=${currentDept}" class="nav-item"><i class="fas fa-user-shield"></i> HOD Office</a>
            <a href="/faculty?dept=${currentDept}" class="nav-item"><i class="fas fa-chalkboard-user"></i> Faculty View</a>
            <a href="/reports?dept=${currentDept}" class="nav-item"><i class="fas fa-file-export"></i> Reports Export</a>
        ` : ''}
        <div class="footer-tiny">RFID Integrated System v2.6</div>
        <div style="margin-top:20px"><a href="/login" class="nav-item" style="color:var(--danger)"><i class="fas fa-sign-out-alt"></i> Logout</a></div>
    </div>
    <div class="main animated">
        <div class="header">
            <div><h1 style="margin:0; font-size:1.5rem">${title}</h1><p style="color:#94a3b8; font-size:0.85rem">Department: ${currentDept || 'Campus Admin'}</p></div>
            <div id="clock" style="font-weight:700; color:var(--primary); font-size:1.1rem"></div>
        </div>
        ${content}
    </div>
    <script>
        setInterval(() => { document.getElementById('clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    </script>
</body>
</html>
    `;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
    const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "1st Year"];
    const content = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; margin-top:10px">
            ${depts.map(d => `
                <a href="/hod?dept=${d}" style="text-decoration:none; color:inherit">
                    <div class="card" style="text-align:center; padding:45px; cursor:pointer">
                        <div class="accent-bar" style="background:var(--primary)"></div>
                        <h2 style="margin:0">${d}</h2>
                        <p style="color:#94a3b8; font-size:0.8rem; margin-top:10px">Enter Analytics Room <i class="fas fa-chevron-right"></i></p>
                    </div>
                </a>
            `).join("")}
        </div>
    `;
    res.send(layout("Campus Directory", content));
});

/* ================= HOD VIEW ================= */
app.get("/hod", (req, res) => {
    const dept = req.query.dept || "General";
    const cls = req.query.className || "SE";
    const sub = req.query.subject || "";
    const data = getAnalytics({ className: cls, subject: sub });
    const subjects = [...new Set(timetable.map(t => t.subject))];

    const content = `
        <div class="toolbar">
            <select onchange="location.href='?dept=${dept}&subject=${sub}&className='+this.value">
                <option value="SE" ${cls==='SE'?'selected':''}>Class: SE</option>
                <option value="TE" ${cls==='TE'?'selected':''}>Class: TE</option>
                <option value="BE" ${cls==='BE'?'selected':''}>Class: BE</option>
            </select>
            <select onchange="location.href='?dept=${dept}&className=${cls}&subject='+this.value">
                <option value="">Filter by Subject</option>
                ${subjects.map(s => `<option value="${s}" ${sub===s?'selected':''}>${s}</option>`).join("")}
            </select>
        </div>

        <div class="stats-grid">
            <div class="card"><div class="accent-bar" style="background:var(--primary)"></div><h4>Present</h4><h2>${data.present}</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--danger)"></div><h4>Absent</h4><h2>${data.absent}</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--success)"></div><h4>Attendance %</h4><h2>${data.percent}%</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--warning)"></div><h4>Capacity</h4><h2>60</h2></div>
        </div>

        <div class="widget">
            <h3 style="margin-top:0">Subject-wise Analytics (Class ${cls})</h3>
            <div style="height:320px"><canvas id="hodChart"></canvas></div>
        </div>

        <script>
            const subData = ${JSON.stringify(data.subjectPercents)};
            new Chart(document.getElementById('hodChart'), {
                type: 'bar',
                data: { 
                    labels: Object.keys(subData).length ? Object.keys(subData) : ['N/A'], 
                    datasets: [{ label: 'Attendance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#4f46e5', borderRadius: 8 }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
        </script>
    `;
    res.send(layout("HOD Dashboard", content, dept));
});

/* ================= FACULTY VIEW ================= */
app.get("/faculty", (req, res) => {
    const dept = req.query.dept || "General";
    const cls = req.query.className || "SE";
    const sub = req.query.subject || "";
    const studSearch = req.query.studentName || "";
    const data = getAnalytics({ className: cls, subject: sub, studentName: studSearch });
    const subjects = [...new Set(timetable.map(t => t.subject))];

    const content = `
        <div class="toolbar">
            <select onchange="location.href='?dept=${dept}&subject=${sub}&studentName=${studSearch}&className='+this.value">
                <option value="SE" ${cls==='SE'?'selected':''}>Class SE</option>
                <option value="TE" ${cls==='TE'?'selected':''}>Class TE</option>
                <option value="BE" ${cls==='BE'?'selected':''}>Class BE</option>
            </select>
            <select onchange="location.href='?dept=${dept}&className=${cls}&studentName=${studSearch}&subject='+this.value">
                <option value="">Filter Subject</option>
                ${subjects.map(s => `<option value="${s}" ${sub===s?'selected':''}>${s}</option>`).join("")}
            </select>
            <div class="search-box">
                <i class="fas fa-search" style="color:#94a3b8"></i>
                <input type="text" placeholder="Search student..." value="${studSearch}" 
                       onkeypress="if(event.key==='Enter') location.href='?dept=${dept}&className=${cls}&subject=${sub}&studentName='+this.value">
            </div>
        </div>

        <div class="stats-grid">
            <div class="card"><div class="accent-bar" style="background:var(--success)"></div><h4>Present</h4><h2>${data.present}</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--danger)"></div><h4>Absent</h4><h2>${data.absent}</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--primary)"></div><h4>Rate</h4><h2>${data.percent}%</h2></div>
            <div class="card"><div class="accent-bar" style="background:var(--warning)"></div><h4>Total Scans</h4><h2>${data.records.length}</h2></div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:25px">
            <div class="widget">
                <h3>Subject Wise Comparison 📊</h3>
                <div style="height:250px"><canvas id="subjChart"></canvas></div>
            </div>
            <div class="widget">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px">
                    <h3 style="margin:0">Engagement Trend 📉</h3>
                    <div>
                        <button class="btn-toggle active" id="btnW" onclick="toggleTrend('W')">Weekly</button>
                        <button class="btn-toggle" id="btnM" onclick="toggleTrend('M')">Monthly</button>
                    </div>
                </div>
                <div style="height:250px"><canvas id="trendChart"></canvas></div>
            </div>
        </div>

        <script>
            // Subject Bar Chart
            const subData = ${JSON.stringify(data.subjectPercents)};
            new Chart(document.getElementById('subjChart'), {
                type: 'bar',
                data: { 
                    labels: Object.keys(subData).length ? Object.keys(subData) : ['N/A'], 
                    datasets: [{ label: 'Attendance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#10b981', borderRadius: 8 }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            // Trend Line Chart
            let trend = new Chart(document.getElementById('trendChart'), {
                type: 'line',
                data: { 
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 
                    datasets: [{ label: 'Class Avg %', data: [0, 0, 0, 0, 0, ${data.percent}], borderColor: '#4f46e5', tension: 0.4, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.05)' }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            function toggleTrend(mode) {
                document.getElementById('btnW').classList.toggle('active', mode==='W');
                document.getElementById('btnM').classList.toggle('active', mode==='M');
                if(mode==='M') {
                    trend.data.labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
                    trend.data.datasets[0].data = [0, 0, 0, ${data.percent}];
                } else {
                    trend.data.labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    trend.data.datasets[0].data = [0, 0, 0, 0, 0, ${data.percent}];
                }
                trend.update();
            }
        </script>
    `;
    res.send(layout("Faculty Hub", content, dept));
});

/* ================= REPORTS ================= */
app.get("/reports", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    res.send(layout("Data Export", `
        <div class="widget" style="text-align:center; padding:60px">
            <i class="fas fa-file-csv fa-4x" style="color:var(--success); margin-bottom:25px"></i>
            <h2>Generate Attendance Sheet</h2>
            <p style="color:#94a3b8; max-width:450px; margin:10px auto 30px">Convert RFID scan logs into a professional Excel CSV report for academic records.</p>
            <button onclick="exportCSV()" style="padding:15px 40px; background:var(--primary); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer">
                <i class="fas fa-download"></i> DOWNLOAD EXCEL (.CSV)
            </button>
        </div>
        <script>
            function exportCSV() {
                const data = ${JSON.stringify(data.records)};
                if(data.length === 0) return alert("System state is Zero. No scans found.");
                let csv = "Name,Class,Subject,Date\\n";
                data.forEach(r => { csv += \`\${r.name},\${r.className},\${r.subject},\${r.date}\\n\`; });
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'Report_' + new Date().toISOString().split('T')[0] + '.csv';
                document.body.appendChild(a); a.click();
            }
        </script>
    `, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
    res.send(`
        <body style="background:#f3f4f6; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif">
            <div style="background:white; padding:60px; border-radius:30px; box-shadow:0 15px 30px rgba(0,0,0,0.05); text-align:center; width:360px; border:1px solid #e5e7eb">
                <div style="color:var(--primary); font-size:3.5rem; margin-bottom:20px"><i class="fas fa-id-card-clip"></i></div>
                <h1 style="margin:0; font-size:1.8rem; letter-spacing:-1px; color:#111827">Academic Portal</h1>
                <p style="color:#6b7280; margin:10px 0 40px 0; font-weight:500">Authorized Personnel Access</p>
                <button onclick="location.href='/principal'" style="width:100%; padding:16px; background:var(--primary); color:white; border:none; border-radius:12px; cursor:pointer; font-weight:700; font-size:1rem; transition:0.3s">Enter Portal</button>
                <div style="margin-top:40px; font-size:0.6rem; color:#cbd5e1; font-weight:700; letter-spacing:1px">RFID SYSTEM INTEGRATED</div>
            </div>
        </body>
    `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Server: http://localhost:" + PORT));