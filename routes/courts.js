const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Helper: แปลง longtext ให้เป็น Array (เหมือน $casts)
 */
const castCourt = (court) => {
    if (!court) return null;
    return {
        ...court,
        current_players: typeof court.current_players === 'string' 
            ? JSON.parse(court.current_players) 
            : (Array.isArray(court.current_players) ? court.current_players : [])
    };
};

// [GET] /api/courts (index)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM courts ORDER BY id ASC");

        // ทำ Eager Loading ผู้เล่นที่อยู่ในสนาม (Map player objects)
        const courts = await Promise.all(rows.map(async (row) => {
            const court = castCourt(row);
            let playerObjs = [];

            if (court.current_players.length > 0) {
                const placeholders = court.current_players.map(() => '?').join(',');
                const [players] = await db.execute(
                    `SELECT * FROM players WHERE id IN (${placeholders})`,
                    court.current_players
                );
                playerObjs = players;
            }

            return {
                ...court,
                players: playerObjs // ข้อมูลผู้เล่นเต็มรูปแบบสำหรับหน้า Frontend
            };
        }));

        res.json({ courts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] /api/courts (store)
router.post('/', async (req, res) => {
    const { name } = req.body;
    try {
        const [result] = await db.execute(
            "INSERT INTO courts (name, status, current_players, finished, match_id) VALUES (?, 'available', '[]', 0, 0)",
            [name]
        );
        const [newCourt] = await db.execute("SELECT * FROM courts WHERE id = ?", [result.insertId]);
        res.status(201).json({ court: castCourt(newCourt[0]) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] /api/courts/:id/finish (finish)
router.post('/:id/finish', async (req, res) => {
    const { id } = req.params;
    try {
        // เคลียร์สนาม (status=available, current_players=[], finished=1)
        await db.execute(
            "UPDATE courts SET status = 'available', current_players = '[]', finished = 1, match_id = 0 WHERE id = ?",
            [id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] /api/courts/:id/rollback (rollback)
router.post('/:id/rollback', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute("SELECT current_players FROM courts WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Court not found" });

        const court = castCourt(rows[0]);
        res.json({ success: true, rolledGroup: court.current_players });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;