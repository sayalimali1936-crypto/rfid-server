const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// Root check
app.get("/", (req, res) => {
  res.send("RFID Server is running");
});

// RFID log endpoint
app.get("/log", (req, res) => {
  const cardNo = req.query.card_no;

  if (!cardNo) {
    return res.status(400).send("NO CARD NUMBER");
  }

  console.log("📌 Card scanned:", cardNo);

  // Simple response for ESP
  res.send("OK");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
