const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve everything in the repository root (static assets + index.html)
app.use(express.static(__dirname, { extensions: ["html"] }));

// Fallback to index.html for any unmatched route (handy for client-side routing later)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Quantum Relay Chess server running on port ${PORT}`);
});
