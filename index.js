// index.js
const express = require("express");
const cors = require("cors");

const playersRoutes = require("./routes/players");
const courtsRoutes = require("./routes/courts");
const matchesRoutes = require("./routes/matches");
const resetRouter = require('./routes/reset');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/players", playersRoutes);
app.use("/api/courts", courtsRoutes);
app.use("/api/matches", matchesRoutes);
app.use('/api/reset', resetRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Export for Vercel
module.exports = app;

// Start server only in development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3333;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}