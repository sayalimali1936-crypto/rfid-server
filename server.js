const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGODB_URI;

let logsCollection;

/* =========================
   START SERVER AFTER DB READY
========================= */
async function startServer() {
  try {
    if (!MONGO_URI) {
      console.error("❌ MONGODB_URI not found");
      process.exit(1);
    }

    const client = new MongoClient(MONGO_URI);
    await client.connect();

    const db = client.db("rfid_attendance");
    logsCollection = db.collection("attendance_logs");

    console.log("✅ MongoDB connected");

    /* =========================
       BASIC ROUTES
    ========================= */

    app.get("/", (req, res) => {
      res.send("RFID Attendance Server Running ✅");
    });

    app.get("/log", async (req, res) => {
      const cardNo = req.query.card_no;

      if (!cardNo) {
        return res.status(400).send("NO CARD");
      }

      try {
        await logsCollection.insertOne({
          card_no: cardNo,
          timestamp: new Date()
        });

        console.log("📌 Attendance logged:", cardNo);
        res.send("OK");
      } catch (err) {
        console.error("❌ Insert error:", err);
        res.status(500).send("ERROR");
      }
    });

    /* =========================
       DASHBOARD API
    ========================= */

    app.get("/api/advanced", async (req, res) => {
      const { classFilter, subjectFilter, dateFilter } = req.query;

      let records = await logsCollection.find().toArray();

      // Convert data format
      records = records.map(r => ({
        name: r.card_no,
        subject: "General",
        className: "NA",
        date: r.timestamp.toISOString().slice(0,10),
        time: r.timestamp.toTimeString().slice(0,5)
      }));

      // Filters
      if (dateFilter) {
        records = records.filter(r => r.date === dateFilter);
      }

      // Aggregations
      let subjectWise = {};
      let studentWise = {};

      records.forEach(r => {
        subjectWise[r.subject] = (subjectWise[r.subject] || 0) + 1;
        studentWise[r.name] = (studentWise[r.name] || 0) + 1;
      });

      // Defaulters (<3 attendance)
      let defaulters = Object.entries(studentWise)
        .filter(([name, count]) => count < 3)
        .map(([name]) => name);

      res.json({
        total: records.length,
        subjectWise,
        studentWise,
        defaulters,
        records
      });
    });

    /* =========================
       WEB DASHBOARD
    ========================= */

    app.get("/dashboard", (req, res) => {
      res.send(`
<!DOCTYPE html>
<html>
<head>
<title>RFID Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body { font-family: Arial; background:#f4f6f8; padding:20px; }
h1 { text-align:center; }

.card {
  background:white;
  padding:15px;
  margin:10px;
  border-radius:10px;
  box-shadow:0 2px 5px rgba(0,0,0,0.1);
}

button {
  padding:10px;
  margin:5px;
  background:#007bff;
  color:white;
  border:none;
  border-radius:5px;
  cursor:pointer;
}

input { padding:5px; margin:5px; }

table { width:100%; border-collapse:collapse; }
th,td { padding:8px; border-bottom:1px solid #ddd; }
</style>
</head>

<body>

<h1>📊 RFID Attendance Dashboard</h1>

<div>
  <button onclick="setView('subject')">Subject Teacher</button>
  <button onclick="setView('class')">Class Teacher</button>
  <button onclick="setView('hod')">HOD</button>
</div>

<div class="card">
  <label>Date:</label>
  <input type="date" id="dateFilter">
  <button onclick="loadData()">Apply</button>
</div>

<div class="card">
  <h2>Total Attendance: <span id="total"></span></h2>
</div>

<div class="card">
  <canvas id="chart"></canvas>
</div>

<div class="card">
  <h2>⚠ Defaulters</h2>
  <div id="defaulters"></div>
</div>

<div class="card">
  <h2>📋 Records</h2>
  <table>
    <thead>
      <tr>
        <th>Name</th><th>Time</th><th>Date</th>
      </tr>
    </thead>
    <tbody id="table"></tbody>
  </table>
</div>

<script>
let currentView = "subject";
let chart;

function setView(view){
  currentView = view;
  loadData();
}

async function loadData(){
  let url = "/api/advanced?";

  const dateF = document.getElementById("dateFilter").value;
  if(dateF) url += "dateFilter=" + dateF;

  const res = await fetch(url);
  const data = await res.json();

  document.getElementById("total").innerText = data.total;

  document.getElementById("defaulters").innerHTML =
    data.defaulters.map(d => "<p>"+d+"</p>").join("");

  const tbody = document.getElementById("table");
  tbody.innerHTML = "";

  data.records.slice(-10).reverse().forEach(r => {
    tbody.innerHTML += \`
      <tr>
        <td>\${r.name}</td>
        <td>\${r.time}</td>
        <td>\${r.date}</td>
      </tr>
    \`;
  });

  let labels = Object.keys(data.studentWise);
  let values = Object.values(data.studentWise);

  if(chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Attendance",
        data: values
      }]
    }
  });
}

loadData();
setInterval(loadData, 5000);
</script>

</body>
</html>
      `);
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
