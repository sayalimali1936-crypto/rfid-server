const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB URI from Render Environment
const MONGO_URI = process.env.MONGODB_URI;

let db;
let collection;

// 🔌 CONNECT TO MONGODB
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, {
      tls: true,
      serverSelectionTimeoutMS: 5000
    });

    await client.connect();
    db = client.db(); // uses DB from URI
    collection = db.collection("attendance");

    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

connectDB();

// 🏠 ROOT TEST
app.get("/", (req, res) => {
  res.send("RFID Server is running");
});

// 🪪 RFID LOG API
app.get("/log", async (req, res) => {
  if (!collection) {
    return res.status(503).send("DB not ready");
  }

  const cardNo = req.query.card_no;

  if (!cardNo) {
    return res.status(400).send("NO CARD NUMBER");
  }

  const entry = {
    card_no: cardNo,
    time: new Date()
  };

  await collection.insertOne(entry);
  console.log("📌 Attendance marked:", cardNo);

  res.send("OK");
});

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
