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

    // Apply Global Filters
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

/* ================= UI SHELL (Professional & Vibrant) ================= */
function layout(title, content, currentDept = "") {
    const subjects = [...new Set(timetable.map(t => t.subject))];
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --primary: #6366f1; --success: #10b981; --danger: #f43f5e; --warning: #f59e0b;
            --bg: #f8fafc; --sidebar: #ffffff; --text: #1e293b; 
        }
        body { margin:0; font-family:'Plus Jakarta Sans', sans-serif; background:var(--bg); color:var(--text); display:flex; height:100vh; overflow:hidden; }
        
        /* SIDEBAR */
        .sidebar { width:270px; background:var(--sidebar); border-right:1px solid #e2e8f0; padding:30px 20px; display:flex; flex-direction:column; box-shadow: 4px 0 15px rgba(0,0,0,0.03); }
        .logo { font-weight:800; color:var(--primary); font-size:1.4rem; margin-bottom:40px; display:flex; align-items:center; gap:12px; }
        .nav-label { font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:20px 0 10px 10px; letter-spacing:1px; }
        .nav-item { padding:12px 18px; border-radius:14px; color:#64748b; text-decoration:none; display:flex; align-items:center; gap:12px; transition:0.2s; font-weight:600; font-size:0.95rem; }
        .nav-item:hover { background:#f1f5f9; color:var(--primary); }
        .nav-item.active { background:linear-gradient(135deg, var(--primary), #4f46e5); color:white; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3); }

        /* MAIN CONTENT */
        .main { flex:1; overflow-y:auto; padding:40px; scroll-behavior: smooth; }
        .header { display:flex; justify-content:space-between; align-items:end; margin-bottom:35px; }
        
        /* FILTER TOOLBAR */
        .toolbar { background:white; padding:18px 25px; border-radius:20px; border:1px solid #f1f5f9; display:flex; gap:15px; align-items:center; margin-bottom:30px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.02); }
        select, input { padding:10px 18px; border-radius:12px; border:1px solid #e2e8f0; font-weight:700; color:var(--text); outline:none; font-size:0.85rem; background:#f8fafc; }
        .search-container { flex:1; display:flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0 15px; }
        .search-container input { border:none; background:transparent; width:100%; }

        /* STATUS CARDS */
        .stats-row { display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:30px; }
        .card { background:white; padding:25px; border-radius:22px; border:1px solid #f1f5f9; box-shadow:0 10px 15px -3px rgba(0,0,0,0.03); position:relative; overflow:hidden; }
        .card h4 { margin:0; font-size:0.75rem; color:#94a3b8; text-transform:uppercase; display:flex; align-items:center; gap:8px; font-weight:800; }
        .card h2 { margin:15px 0 0 0; font-size:2rem; font-weight:800; }
        .card-icon { position:absolute; top:20px; right:20px; font-size:1.2rem; opacity:0.2; }

        .widget { background:white; padding:30px; border-radius:24px; border:1px solid #f1f5f9; box-shadow:0 20px 25px -5px rgba(0,0,0,0.04); }
        .animated { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        
        .footer-rfid { margin-top: auto; font-size: 0.65rem; color: #cbd5e1; text-align: center; letter-spacing: 1px; text-transform: uppercase; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo"><i class="fas fa-compass"></i> NEXUS <span>PORTAL</span></div>
        <a href="/principal" class="nav-item ${title === 'Principal' ? 'active' : ''}">🏢 Principal Home</a>
        ${currentDept ? `
            <div class="nav-label">${currentDept} Control</div>
            <a href="/hod?dept=${currentDept}" class="nav-item">🛡️ HOD Analytics</a>
            <a href="/faculty?dept=${currentDept}" class="nav-item">🎓 Faculty Hub</a>
            <a href="/reports?dept=${currentDept}" class="nav-item">📊 Reports Center</a>
        ` : ''}
        <div class="footer-rfid">RFID-Powered Infrastructure v2.6.4</div>
        <a href="/login" class="nav-item" style="color:var(--danger); margin-top:20px"><i class="fas fa-power-off"></i> Logout</a>
    </div>
    <div class="main animated">
        <div class="header">
            <div><h1 style="margin:0; font-size:1.8rem; color:var(--primary)">${title}</h1><p style="color:#94a3b8; font-weight:600">Department: ${currentDept || 'Campus Administration'}</p></div>
            <div id="clock" style="font-size:1.2rem; font-weight:800; color:var(--primary)"></div>
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
    const colors = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4"];
    const content = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:25px; margin-top:10px">
            ${depts.map((d, i) => `
                <a href="/hod?dept=${d}" style="text-decoration:none; color:inherit">
                    <div class="card" style="text-align:center; padding:50px; cursor:pointer; border-top:5px solid ${colors[i]}">
                        <h2 style="color:${colors[i]}">${d}</h2>
                        <p style="color:#94a3b8; font-size:0.85rem; margin-top:15px; font-weight:700">Open Department Portal <i class="fas fa-arrow-right"></i></p>
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
    const cls = req.query.className || "SE";
    const sub = req.query.subject || "";
    const data = getAnalytics({ className: cls, subject: sub });
    const subjects = [...new Set(timetable.map(t => t.subject))];

    const content = `
        <div class="toolbar">
            <i class="fas fa-sliders" style="color:var(--primary)"></i>
            <select onchange="location.href='?dept=${dept}&subject=${sub}&className='+this.value">
                <option value="SE" ${cls==='SE'?'selected':''}>Batch: SE</option>
                <option value="TE" ${cls==='TE'?'selected':''}>Batch: TE</option>
                <option value="BE" ${cls==='BE'?'selected':''}>Batch: BE</option>
            </select>
            <select onchange="location.href='?dept=${dept}&className=${cls}&subject='+this.value">
                <option value="">Filter by Subject</option>
                ${subjects.map(s => `<option value="${s}" ${sub===s?'selected':''}>${s}</option>`).join("")}
            </select>
        </div>

        <div class="stats-row">
            <div class="card" style="color:var(--primary)"><h4><i class="fas fa-check"></i> Present</h4><h2>${data.present}</h2></div>
            <div class="card" style="color:var(--danger)"><h4><i class="fas fa-xmark"></i> Absent</h4><h2>${data.absent}</h2></div>
            <div class="card" style="color:var(--success)"><h4><i class="fas fa-percentage"></i> Score</h4><h2>${data.percent}%</h2></div>
            <div class="card" style="color:var(--warning)"><h4><i class="fas fa-users"></i> Size</h4><h2>60</h2></div>
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
                    datasets: [{ label: 'Attendance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#6366f1', borderRadius: 12 }] 
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
                <option value="">Select Subject</option>
                ${subjects.map(s => `<option value="${s}" ${sub===s?'selected':''}>${s}</option>`).join("")}
            </select>
            <div class="search-container">
                <i class="fas fa-search" style="color:#94a3b8"></i>
                <input type="text" placeholder="Find Student..." value="${studSearch}" 
                       onkeypress="if(event.key==='Enter') location.href='?dept=${dept}&className=${cls}&subject=${sub}&studentName='+this.value">
            </div>
        </div>

        <div class="stats-row">
            <div class="card" style="border-left:6px solid var(--primary)"><h4>Scans Found</h4><h2>${data.records.length}</h2></div>
            <div class="card" style="border-left:6px solid var(--success)"><h4>Success Rate</h4><h2>${data.percent}%</h2></div>
            <div class="card" style="border-left:6px solid var(--warning)"><h4>Active Subjects</h4><h2>${Object.keys(data.subjectPercents).length}</h2></div>
            <div class="card" style="border-left:6px solid var(--danger)"><h4>Target</h4><h2>60</h2></div>
        </div>

        <div class="widget">
            <h3 style="margin:0 0 20px 0">Academic Scan History 📈</h3>
            <div style="height:350px"><canvas id="facChart"></canvas></div>
        </div>

        <script>
            const subData = ${JSON.stringify(data.subjectPercents)};
            new Chart(document.getElementById('facChart'), {
                type: 'bar',
                data: { 
                    labels: Object.keys(subData).length ? Object.keys(subData) : ['Awaiting Scans'], 
                    datasets: [{ label: 'Attendance %', data: Object.values(subData).length ? Object.values(subData) : [0], backgroundColor: '#10b981', borderRadius: 12 }] 
                },
                options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
        </script>
    `;
    res.send(layout("Faculty Hub", content, dept));
});

/* ================= REPORTS ================= */
app.get("/reports", (req, res) => {
    const dept = req.query.dept || "General";
    const data = getAnalytics({});
    res.send(layout("System Export", `
        <div class="widget" style="text-align:center; padding:60px">
            <i class="fas fa-file-excel fa-4x" style="color:var(--success); margin-bottom:20px"></i>
            <h2>Generate Official Attendance Sheet</h2>
            <p style="color:#94a3b8; max-width:500px; margin:10px auto 30px">Convert real-time RFID logs into a professional Excel-compatible CSV file for record keeping.</p>
            <button onclick="exportCSV()" style="padding:15px 40px; background:var(--success); color:white; border:none; border-radius:15px; font-weight:800; cursor:pointer">
                <i class="fas fa-download"></i> DOWNLOAD EXCEL (.CSV)
            </button>
        </div>
        <script>
            function exportCSV() {
                const data = ${JSON.stringify(data.records)};
                if(data.length === 0) return alert("System state is empty. No data to export.");
                let csv = "Name,Class,Subject,Date\\n";
                data.forEach(r => { csv += \`\${r.name},\${r.className},\${r.subject},\${r.date}\\n\`; });
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'NEXUS_Report_' + new Date().toLocaleDateString() + '.csv';
                document.body.appendChild(a); a.click();
            }
        </script>
    `, dept));
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
    res.send(`
        <body style="background:#f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; font-family:'Plus Jakarta Sans',sans-serif">
            <div style="background:white; padding:60px; border-radius:35px; box-shadow:0 30px 60px -12px rgba(0,0,0,0.08); text-align:center; width:420px; border:1px solid #f1f5f9">
                <div style="color:var(--primary); font-size:4rem; margin-bottom:20px"><i class="fas fa-compass"></i></div>
                <h1 style="margin:0; font-size:2.2rem; font-weight:800; color:#1e293b; letter-spacing:-1px">Nexus Gateway</h1>
                <p style="color:#94a3b8; font-weight:600; margin:10px 0 40px 0">Authorized Academic Access Only</p>
                <button onclick="location.href='/principal'" style="width:100%; padding:18px; background:#6366f1; color:white; border:none; border-radius:18px; cursor:pointer; font-weight:800; font-size:1.1rem; box-shadow: 0 10px 20px -5px rgba(99,102,241,0.4)">Access Dashboards</button>
                <div style="margin-top:50px; font-size:0.65rem; color:#cbd5e1; font-weight:800; letter-spacing:2px">RFID SYSTEM V2.6</div>
            </div>
        </body>
    `);
});

app.get("/", (req, res) => res.redirect("/login"));
app.listen(PORT, () => console.log("🚀 Nexus Portal Live: http://localhost:" + PORT));