const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

/*
  IMPORTANT:
  You MUST have this in Render → Environment Variables

  Key   : MONGODB_URI
  Value : mongodb+srv://sayalirmali_db_user:nodemark@cluster0.p1yhjxt.mongodb.net/?retryWrites=true&w=majority
*/

const MONGO_URI = process.env.MONGODB_URI;

let logsCollection = null;

/* ============================
   START SERVER AFTER DB READY
============================ */
async function startServer() {
  try {
    if (!MONGO_URI) {
      console.error("❌ MONGODB_URI not found");
      process.exit(1);
    }

    // ✅ TLS FIX FOR RENDER + ATLAS
    const client = new MongoClient(MONGO_URI, {
      tls: true,
      tlsAllowInvalidCertificates: true
    });

    await client.connect();

    const db = client.db("rfid_attendance");
    logsCollection = db.collection("attendance_logs");

    console.log("✅ MongoDB connected successfully");

    /* ---------- ROUTES ---------- */

    // Root route
    app.get("/", (req, res) => {
      res.send("RFID Attendance Server Running ✅");
    });

    // RFID log route
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
        res.send("OK");   // ESP EXPECTS THIS
      } catch (err) {
        console.error("❌ Insert error:", err);
        res.status(500).send("ERROR");
      }
    });

    // Start listening ONLY after DB is ready
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
