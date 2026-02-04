const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB URI from Render Environment Variable
const MONGO_URI = process.env.MONGO_URI;

let mongoClient;
let logsCollection;

// ===== CONNECT TO MONGODB =====
async function connectDB() {
  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();

    const db = mongoClient.db("rfid_attendance");
    logsCollection = db.collection("attendance_logs");

    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
  }
}

connectDB();

// ===== ROOT ROUTE =====
app.get("/", (req, res) => {
  res.send("RFID Attendance Server Running ✅");
});

// ===== RFID LOG ROUTE =====
app.get("/log", async (req, res) => {
  const cardNo = req.query.card_no;

  if (!cardNo) {
    return res.status(400).send("NO CARD");
  }

  if (!logsCollection) {
    console.error("❌ DB not ready");
    return res.status(500).send("DB NOT READY");
  }

  try {
    await logsCollection.insertOne({
      card_no: cardNo,
      timestamp: new Date(),
    });

    console.log("📌 Attendance logged:", cardNo);
    res.send("OK"); // ESP EXPECTS THIS
  } catch (err) {
    console.error("❌ Insert error:", err.message);
    res.status(500).send("ERROR");
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
