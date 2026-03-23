// routes/matches.js
const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET all matches */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM matches"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET single Player */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM matches WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "Player not found" });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* CREATE Player */
router.post("/", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email)
    return res.status(400).json({ error: "Name and email required" });

  try {
    const [result] = await db.execute(
      "INSERT INTO matches (name, email) VALUES (?, ?)",
      [name, email]
    );

    res.status(201).json({ id: result.insertId, name, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* DELETE Player */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.execute(
      "DELETE FROM matches WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Player not found" });

    res.status(204).json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;