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

/* ================= CORE LOGIC (UNTOUCHED & ZEROED) ================= */
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

    // Apply Filter Logic
    if (filters.className) records = records.filter(r => r.className === filters.className);
    if (filters.subject) records = records.filter(r => r.subject === filters.subject);
    if (filters.studentName) {
        records = records.filter(r => r.name.toLowerCase().includes(filters.studentName.toLowerCase()));
    }

    // Dynamic Class Strength
    const strengthMap = { "SE": 60, "TE": 55, "BE": 50 };
    const totalCapacity = strengthMap[filters.className] || 60;

    let subjectCounts = {};
    records.forEach(r => { subjectCounts[r.subject] = (subjectCounts[r.subject] || 0) + 1; });
    
    let subjectPercents = {};
    Object.keys(subjectCounts).forEach(s => {
        subjectPercents[s] = Math.min(100, (subjectCounts[s] / totalCapacity) * 100).toFixed(1);
    });

    let present = records.length;
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

/* ================= UI SHELL (Vivid Professional Theme) ================= */
function layout(title, content, currentDept = "") {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --indigo: #4f46e5; --emerald: #10b981; --rose: #f43f5e; --amber: #f59e0b;
            --bg: #f9fafb; --sidebar: #ffffff; --text: #111827; 
        }
        body { margin:0; font-family:'Inter', sans-serif; background:var(--bg); color:var(--text); display:flex; height:100vh; overflow:hidden; }
        
        /* SIDEBAR */
        .sidebar { width:270px; background:var(--sidebar); border-right:1px solid #e5e7eb; padding:30px 20px; display:flex; flex-direction:column; box-shadow: 2px 0 10px rgba(0,0,0,0.02); }
        .logo { font-weight:900; color:var(--indigo); font-size:1.4rem; margin-bottom:40px; display:flex; align-items:center; gap:12px; }
        .nav-label { font-size:0.7rem; font-weight:800; color:#9ca3af; text-transform:uppercase; margin:20px 0 10px 10px; letter-spacing:1px; }
        .nav-item { padding:13px 18px; border-radius:14px; color:#4b5563; text-decoration:none; display:flex; align-items:center; gap:12px; transition:0.2s; font-weight:600; font-size:0.9rem; }
        .nav-item:hover { background:#f3f4f6; color:var(--indigo); }
        .nav-item.active { background:var(--indigo); color:white; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3); }

        /* MAIN CONTENT */
        .main { flex:1; overflow-y:auto; padding:40px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:35px; }
        .dept-indicator { background: #eef2ff; color: var(--indigo); padding: 6px 16px; border-radius: 20px; font-size: 0.8rem; font-weight: 800; border: 1px solid #e0e7ff; }

        /* KPI CARDS */
        .stats-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:30px; }
        .card { background:white; padding:25px; border-radius:22px; border:1px solid #f1f5f9; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03); position:relative; overflow:hidden; }
        .card::before { content:''; position:absolute; top:0; left:0; width:100%; height:4px; }
        .card.indigo::before { background: var(--indigo); }
        .card.emerald::before { background: var(--emerald); }
        .card.rose::before { background: var(--rose); }
        .card.amber::before { background: var(--amber); }

        .card h4 { margin:0; font-size:0.75rem; color:#9ca3af; text-transform:uppercase; font-weight:800; letter-spacing:0.5px; display:flex; align-items:center; gap:8px; }
        .card h2 { margin:15px 0 0 0; font-size:2.2rem; font-weight:900; }

        /* TOOLBAR */
        .toolbar { background:white; padding:15px 25px; border-radius:18px; border:1px solid #f1f5f9; display:flex; gap:15px; align-items:center; margin-bottom:30px; }
        select, input { padding:10px 18px; border-radius:12px; border:1px solid #e5e7eb; font-weight:700; color:#374151; outline:none; font-size:0.85rem; }
        .search-wrap { flex:1; display:flex; align-items:center; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:0 15px; }
        .search-wrap input { border:none; background:transparent; width:100%; }

        /* WIDGETS */
        .widget { background:white; padding:30px; border-radius:24px; border:1px solid #f1f5f9; box-shadow:0 10px 15px -3px rgba(0,0,0,0.04); margin-bottom:25px; }
        .widget-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        
        .btn-mode { padding:6px 14px; border-radius:8px; border:1px solid #e5e7eb; cursor:pointer; font-weight:700; font-size:0.75rem; transition:0.2s; }
        .btn-mode.active { background:var(--indigo); color:white; border-color:var(--indigo); }

        .footer-tech { margin-top:auto; font-size:0.6rem; color:#d1d5db; text-align:center; letter-spacing:2px; font-weight:800; }
        .animated { animation: fadeInUp 0.5s ease-out; }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-layer-group"></i> PORTAL</div>
        
        <a href="/principal" class="nav-item ${title === 'Principal' ? 'active' : ''}">🏠 Principal Home</a>
        
        ${currentDept ? `
            <div class="nav-label">${currentDept} DEPT</div>
            <a href="/hod?dept=${currentDept}" class="nav-item">🏢 HOD Dashboard</a>
            <a href="/faculty?dept=${currentDept}" class="nav-item">🎓 Faculty Portal</a>
            <a href="/reports?dept=${currentDept}" class="nav-item">📊 Data Reports</a>
        ` : ''}

        <div class="footer-tech">RFID INTERFACE V2.7</div>
        <div style="margin-top:20px"><a href="/login" class="nav-item" style="color:var(--rose)"><i class="fas fa-power-off"></i> Logout</a></div>
    </div>

    <div class="main animated">
        <div class="header">
            <div>
                <h1 style="margin:0; font-size:1.7rem; font-weight:900; color:var(--indigo)">${title}</h1>
                <p style="color:#9ca3af; font-weight:600; font-size:0.9rem">Monitoring Active Academic Scans</p>
            </div>
            <div id="live-clock" style="font-size:1.2rem; font-weight:900; color:var(--indigo)"></div>
        </div>
        ${content}
    </div>

    <script>
        setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    </script>
</body>
</html>
    `;
}

/* ================= PRINCIPAL VIEW ================= */
app.get("/principal", (req, res) => {
    const depts = ["Electrical", "Computer", "Civil", "Mechanical", "ENTC", "1st Year"];
    const colors = ["#4f46e5", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4"];
    const content = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:25px; margin-top:10px">
            ${depts.map((d, i) => `
                <a href="/hod?dept=${d}" style="text-decoration:none; color:inherit">
                    <div class="card" style="text-align:center; padding:50px; cursor:pointer; border-top:6px solid ${colors[i]}">
                        <h2 style="color:${colors[i]}">${d}</h2>
                        <p style="color:#9ca3af; font-weight:700; font-size:0.85rem; margin-top:15px">Enter Dashboard <i class="fas fa-chevron-right"></i></p>
                    </div>
                </a>
            `).join("")}
        </div>
    `;
    res.send(layout("Global Campus Overview", content));
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
            <div class="card emerald"><h4>✅ Present</h4><h2 style="color:var(--emerald)">${data.present}</h2></div>
            <div class="card rose"><h4>❌ Absent</h4><h2 style="color:var(--rose)">${data.absent}</h2></div>
            <div class="card indigo"><h4>📈 Attendance %</h4><h2 style="color:var(--indigo)">${data.percent}%</h2></div>
            <div class="card amber"><h4>👥 Total Students</h4><h2 style="color:var(--amber)">${data.total}</h2></div>
        </div>

        <div class="widget">
            <h3>Subject Performance Analytics (Class ${cls})</h3>
            <div style="height:320px"><canvas id="hodChart"></canvas></div>
        </div>

        <script>
            const subData = ${JSON.stringify(data.subjectPercents)};
            new Chart(document.getElementById('hodChart'), {
                type: 'bar',
                data: { 
                    labels: Object.keys(subData).length ? Object.keys(subData) : ['Awaiting Scans'], 
                    datasets: [{ label: 'Performance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#4f46e5', borderRadius: 12 }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
        </script>
    `;
    res.send(layout("HOD Control Desk", content, dept));
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
                <option value="SE" ${cls==='SE'?'selected':''}>Batch: SE</option>
                <option value="TE" ${cls==='TE'?'selected':''}>Batch: TE</option>
                <option value="BE" ${cls==='BE'?'selected':''}>Batch: BE</option>
            </select>
            <select onchange="location.href='?dept=${dept}&className=${cls}&studentName=${studSearch}&subject='+this.value">
                <option value="">Choose Subject</option>
                ${subjects.map(s => `<option value="${s}" ${sub===s?'selected':''}>${s}</option>`).join("")}
            </select>
            <div class="search-wrap">
                <i class="fas fa-search" style="color:#9ca3af"></i>
                <input type="text" placeholder="Search student name..." value="${studSearch}" 
                       onkeypress="if(event.key==='Enter') location.href='?dept=${dept}&className=${cls}&subject=${sub}&studentName='+this.value">
            </div>
        </div>

        <div class="stats-grid">
            <div class="card emerald"><h4>✨ Present</h4><h2 style="color:var(--emerald)">${data.present}</h2></div>
            <div class="card rose"><h4>🚶 Absent</h4><h2 style="color:var(--rose)">${data.absent}</h2></div>
            <div class="card indigo"><h4>📊 Class Score</h4><h2 style="color:var(--indigo)">${data.percent}%</h2></div>
            <div class="card amber"><h4>🏫 Strength</h4><h2 style="color:var(--amber)">${data.total}</h2></div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:25px">
            <div class="widget">
                <div class="widget-title"><h3>Subject-wise Comparison 📋</h3></div>
                <div style="height:280px"><canvas id="subjChart"></canvas></div>
            </div>
            <div class="widget">
                <div class="widget-title">
                    <h3>Participation Trend 📈</h3>
                    <div>
                        <button class="btn-mode active" id="btnW" onclick="updateTrend('W')">Weekly</button>
                        <button class="btn-mode" id="btnM" onclick="updateTrend('M')">Monthly</button>
                    </div>
                </div>
                <div style="height:280px"><canvas id="trendChart"></canvas></div>
            </div>
        </div>

        <script>
            // Bar Chart
            const subData = ${JSON.stringify(data.subjectPercents)};
            new Chart(document.getElementById('subjChart'), {
                type: 'bar',
                data: { 
                    labels: Object.keys(subData).length ? Object.keys(subData) : ['N/A'], 
                    datasets: [{ label: 'Attendance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#10b981', borderRadius: 10 }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            // Trend Chart
            let trend = new Chart(document.getElementById('trendChart'), {
                type: 'line',
                data: { 
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 
                    datasets: [{ label: 'Attendance %', data: [0, 0, 0, 0, 0, ${data.percent}], borderColor: '#4f46e5', tension: 0.4, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.05)' }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            function updateTrend(mode) {
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
    res.send(layout("Faculty Activity Hub", content, dept));
});

/* ================= REPORTS ================= */
app.get("/reports", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    res.send(layout("System Export", `
        <div class="widget" style="text-align:center; padding:60px">
            <div style="background:var(--emerald); color:white; width:80px; height:80px; border-radius:20px; display:flex; align-items:center; justify-content:center; margin:0 auto 25px; font-size:2.5rem">
                <i class="fas fa-file-excel"></i>
            </div>
            <h2>Generate Official Report</h2>
            <p style="color:#9ca3af; max-width:450px; margin:10px auto 30px; font-weight:600">Export current RFID scan logs into a professional Excel CSV file for departmental records.</p>
            <button onclick="exportCSV()" style="padding:16px 50px; background:var(--indigo); color:white; border:none; border-radius:15px; font-weight:800; cursor:pointer; font-size:1rem">
                <i class="fas fa-download"></i> DOWNLOAD EXCEL SHEET
            </button>
        </div>
        <script>
            function exportCSV() {
                const data = ${JSON.stringify(data.records)};
                if(data.length === 0) return alert("System state is currently Zero. Please scan students before exporting.");
                let csv = "Student Name,Class,Batch,Subject,Date\\n";
                data.forEach(r => { csv += \`\${r.name},\${r.className},\${r.batch},\${r.subject},\${r.date}\\n\`; });
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'Attendance_Log_' + new Date().toISOString().split('T')[0] + '.csv';
                document.body.appendChild(a); a.click();
            }
        </script>
    `, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
    res.send(`
        <body style="background:#f3f4f6; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif">
            <div style="background:white; padding:60px; border-radius:35px; box-shadow:0 30px 60px -12px rgba(0,0,0,0.08); text-align:center; width:400px; border:1px solid #e5e7eb">
                <div style="color:var(--indigo); font-size:4rem; margin-bottom:25px"><i class="fas fa-fingerprint"></i></div>
                <h1 style="margin:0; font-size:2.2rem; font-weight:900; color:#111827; letter-spacing:-1px">Academic Portal</h1>
                <p style="color:#9ca3af; font-weight:700; margin:10px 0 40px 0">Authorized Faculty Access Only</p>
                <button onclick="location.href='/principal'" style="width:100%; padding:18px; background:#4f46e5; color:white; border:none; border-radius:15px; cursor:pointer; font-weight:800; font-size:1.1rem; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.3)">Enter Dashboard</button>
            </div>
        </body>
    `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Professional Portal: http://localhost:" + PORT));