// routes/players.js
const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET all players */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM players"
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
      "SELECT * FROM players WHERE id = ?",
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
  // 1. รับค่าจาก body (ตัด email ออกถ้าไม่ได้ใช้ในตาราง players)
  const { name, level, gender } = req.body;

  // 2. ตรวจสอบเงื่อนไข (Validation)
  // เช็กแค่ name เพราะใน SQL ของคุณไม่มีฟิลด์ email
  if (!name) {
    return res.status(400).json({ error: "กรุณาระบุชื่อผู้เล่น (Name is required)" });
  }

  try {
    const [result] = await db.execute(
      "INSERT INTO players (name, level, gender, matches, last_played_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
      [
        name,                // ? 1
        level || null,       // ? 2
        gender || null,      // ? 3
        0,                   // ? 4
        -1                   // ? 5
      ]
    );

    // 3. ส่งข้อมูลกลับ (Response)
    // ส่งเฉพาะข้อมูลที่มีอยู่จริงในตาราง
    res.status(201).json({ 
      id: result.insertId, 
      name, 
      level: level || null, 
      gender: gender || null,
      message: "เพิ่มผู้เล่นสำเร็จ" 
    });

  } catch (err) {
    // กรณี Error เช่น ชื่อซ้ำ (ถ้าตั้ง Unique ไว้) หรือ Database เชื่อมต่อไม่ได้
    res.status(500).json({ error: err.message });
  }
});

/* DELETE Player */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.execute(
      "DELETE FROM players WHERE id = ?",
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