// routes/courts.js
const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET all courts */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM courts"
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
      "SELECT * FROM courts WHERE id = ?",
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
      "INSERT INTO courts (name, email) VALUES (?, ?)",
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
      "DELETE FROM courts WHERE id = ?",
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