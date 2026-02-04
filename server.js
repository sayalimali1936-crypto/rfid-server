const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 IMPORTANT: must match Render variable name
const MONGO_URI = process.env.MONGODB_URI;

let logsCollection = null;

/* =========================
   CONNECT TO MONGODB FIRST
========================= */
async function startServer() {
  try {
    if (!MONGO_URI) {
      console.error("❌ MONGODB_URI not found in environment");
      process.exit(1);
    }

    const client = new MongoClient(MONGO_URI);
    await client.connect();

    const db = client.db("rfid_attendance");
    logsCollection = db.collection("attendance_logs");

    console.log("✅ MongoDB connected");

    /* =========================
       ROUTES (AFTER DB READY)
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
          timestamp: new Date(),
        });

        console.log("📌 Attendance logged:", cardNo);
        res.send("OK");
      } catch (err) {
        console.error("❌ Insert failed:", err);
        res.status(500).send("ERROR");
      }
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
