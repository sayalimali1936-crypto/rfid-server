const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB URI from Render Environment Variables
const MONGO_URI = process.env.MONGODB_URI;

let collection;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      tls: true,
    });

    await client.connect();
    const db = client.db("rfid_attendance");
    collection = db.collection("logs");

    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

app.get("/", (req, res) => {
  res.send("RFID Server Running ✅");
});

app.get("/log", async (req, res) => {
  if (!collection) {
    return res.status(500).send("DB NOT READY");
  }

  const card = req.query.card_no;
  if (!card) return res.status(400).send("NO CARD");

  await collection.insertOne({
    card_no: card,
    time: new Date(),
  });

  console.log("📌 Card logged:", card);
  res.send("OK");
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
