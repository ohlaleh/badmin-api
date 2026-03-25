const express = require('express');
const router = express.Router();
const db = require('../db'); 

const castPlayer = (player) => {
    if (!player) return null;

    let teammates = {};
    let restricted_player_ids = [];

    try {
        // จัดการ teammates
        teammates = (typeof player.teammates === 'string') 
            ? JSON.parse(player.teammates || '{}') 
            : (player.teammates || {});
            
        // 1. จัดการ restricted_player_ids ที่เพิ่มใหม่
        restricted_player_ids = (typeof player.restricted_player_ids === 'string')
            ? JSON.parse(player.restricted_player_ids || '[]')
            : (player.restricted_player_ids || []);
    } catch (e) {
        teammates = {};
        restricted_player_ids = [];
    }

    return {
        ...player,
        matches: Number(player.matches || 0),
        last_played_round: Number(player.last_played_round ?? -1),
        // 2. มั่นใจว่าเป็น Number เสมอ
        pairing_policy: Number(player.pairing_policy || 0), 
        teammates,
        restricted_player_ids
    };
};

// 1. [GET] /api/players
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT * FROM players 
            ORDER BY 
                CASE WHEN play_status = 'active' THEN 0 ELSE 1 END, 
                matches ASC
        `);
        res.json({ players: rows.map(castPlayer) });
    } catch (err) {
        res.status(500).json({ error: 'Database Error', message: err.message });
    }
});

// 2. [POST] /api/players (เพิ่มรองรับฟิลด์ใหม่)
router.post('/', async (req, res) => {
    const { name, level, gender, teammates, pairing_policy, restricted_player_ids } = req.body;

    if (!name) return res.status(422).json({ message: "Name is required" });

    try {
        const teammatesString = JSON.stringify(teammates || {});
        // 3. แปลง Array เป็น JSON String ก่อนลง DB
        const restrictedString = JSON.stringify(restricted_player_ids || []);
        
        const [result] = await db.execute(
            `INSERT INTO players (name, level, gender, teammates, pairing_policy, restricted_player_ids, matches, last_played_round, play_status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                name, 
                level || 'N-', 
                gender || 'Male', 
                teammatesString, 
                pairing_policy || 0, 
                restrictedString, 
                0, -1, 'active'
            ]
        );

        const [newRows] = await db.execute("SELECT * FROM players WHERE id = ?", [result.insertId]);
        res.status(201).json({ player: castPlayer(newRows[0]) });
    } catch (err) {
        res.status(500).json({ error: 'Store Error', message: err.message });
    }
});

// 3. [PUT] /api/players/:id (เพิ่มการอัปเดตฟิลด์ใหม่)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        name, level, matches, last_played_round, gender, 
        teammates, play_status, pairing_policy, restricted_player_ids 
    } = req.body;

    try {
        const teammatesString = JSON.stringify(teammates || {});
        const restrictedString = JSON.stringify(restricted_player_ids || []);

        const [result] = await db.execute(
            `UPDATE players 
                SET name = ?, level = ?, matches = ?, last_played_round = ?, gender = ?, 
                    teammates = ?, play_status = ?, pairing_policy = ?, restricted_player_ids = ?, 
                    updated_at = NOW() 
                WHERE id = ?`,
            [
                name, level, matches || 0, last_played_round ?? -1, gender, 
                teammatesString, play_status || 'active', 
                pairing_policy || 0, restrictedString, id
            ]
        );

        if (result.affectedRows === 0) return res.status(404).json({ message: "Player not found" });

        const [updatedRows] = await db.execute("SELECT * FROM players WHERE id = ?", [id]);
        res.json({ player: castPlayer(updatedRows[0]) });
        
    } catch (err) {
        res.status(500).json({ error: 'Update Error', message: err.message });
    }
});

// 4. [DELETE] /api/players/:id (สำคัญสำหรับหน้าจัดการ)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute("DELETE FROM players WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Player not found" });
        res.json({ success: true, message: "Player deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: 'Delete Error', message: err.message });
    }
});

// 5. [PATCH] /api/players/:id/play_status
router.patch('/:id/play_status', async (req, res) => {
    const { id } = req.params;
    const { play_status } = req.body;

    if (!['active', 'stopped'].includes(play_status)) {
        return res.status(422).json({ message: "Invalid status" });
    }

    try {
        await db.execute("UPDATE players SET play_status = ?, updated_at = NOW() WHERE id = ?", [play_status, id]);
        const [rows] = await db.execute("SELECT * FROM players WHERE id = ?", [id]);
        res.json({ success: true, player: castPlayer(rows[0]) });
    } catch (err) {
        res.status(500).json({ error: 'Patch Error', message: err.message });
    }
});

module.exports = router;