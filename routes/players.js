const express = require('express');
const router = express.Router();
const db = require('../db'); // ไฟล์เชื่อมต่อ TiDB/MySQL (pool.promise())

/**
 * Helper: สำหรับจัดการฟิลด์ longtext (JSON string) ให้เป็น Array
 * เพื่อเลียนแบบ $casts ใน Laravel
 */
const castPlayer = (player) => {
    if (!player) return null;
    let teammates = [];
    try {
        // ถ้าใน DB เป็น string ให้ parse, ถ้าว่างให้เป็น []
        teammates = typeof player.teammates === 'string' 
            ? JSON.parse(player.teammates) 
            : (player.teammates || []);
    } catch (e) {
        teammates = [];
    }
    
    return {
        ...player,
        teammates: teammates
    };
};

// 1. [GET] /api/players (index)
// ดึงรายชื่อผู้เล่นทั้งหมด เรียงตามจำนวนแมตช์ที่เล่น (น้อยไปมาก)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM players ORDER BY matches ASC");
        const players = rows.map(castPlayer);
        res.json({ players });
    } catch (err) {
        console.error('Get players error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 2. [POST] /api/players (store)
// สร้างผู้เล่นใหม่
router.post('/', async (req, res) => {
    const { name, level, gender, teammates } = req.body;

    // Validation (Laravel: required|string)
    if (!name) {
        return res.status(422).json({ message: "The name field is required." });
    }

    // Validation Level (Laravel: in:N-,N,S,P)
    const allowedLevels = ['N-', 'N', 'S', 'P', null];
    if (level && !allowedLevels.includes(level)) {
        return res.status(422).json({ message: "Invalid level value (N-, N, S, P)." });
    }

    try {
        // เตรียมข้อมูลบันทึก (teammates ต้องเป็น String ก่อนลง longtext)
        const teammatesString = JSON.stringify(teammates || []);
        
        const [result] = await db.execute(
            `INSERT INTO players (name, level, gender, teammates, matches, last_played_round, play_status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, level || null, gender || null, teammatesString, 0, -1, 'active']
        );

        // ดึงข้อมูลที่เพิ่งสร้างกลับมาส่งให้ Frontend
        const [newRows] = await db.execute("SELECT * FROM players WHERE id = ?", [result.insertId]);
        res.status(201).json({ player: castPlayer(newRows[0]) });
    } catch (err) {
        console.error('Store player error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 3. [PUT] /api/players/:id (update)
// แก้ไขข้อมูลผู้เล่นทั้งหมด
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, level, matches, last_played_round, gender, teammates, play_status } = req.body;

    try {
        // แปลง teammates เป็น string ก่อนบันทึก
        const teammatesString = JSON.stringify(teammates || []);

        const [result] = await db.execute(
            `UPDATE players 
             SET name = ?, level = ?, matches = ?, last_played_round = ?, gender = ?, teammates = ?, play_status = ?, updated_at = NOW() 
             WHERE id = ?`,
            [name, level, matches, last_played_round, gender, teammatesString, play_status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Player not found" });
        }

        const [updatedRows] = await db.execute("SELECT * FROM players WHERE id = ?", [id]);
        res.json({ player: castPlayer(updatedRows[0]) });
    } catch (err) {
        console.error('Update player error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 4. [PATCH] /api/players/:id/play_status (updatePlayStatus)
// แก้ไขสถานะการเล่นอย่างเดียว (active/stopped)
router.patch('/:id/play_status', async (req, res) => {
    const { id } = req.params;
    const { play_status } = req.body;

    // Validation
    if (!['active', 'stopped'].includes(play_status)) {
        return res.status(422).json({ message: "Status must be active or stopped." });
    }

    try {
        const [result] = await db.execute(
            "UPDATE players SET play_status = ?, updated_at = NOW() WHERE id = ?",
            [play_status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Player not found" });
        }

        const [rows] = await db.execute("SELECT * FROM players WHERE id = ?", [id]);
        res.json({ success: true, player: castPlayer(rows[0]) });
    } catch (err) {
        console.error('Patch status error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

module.exports = router;