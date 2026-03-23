const express = require('express');
const router = express.Router();
const db = require('../db');
const MatchmakerService = require('../services/MatchmakerService');

const maker = new MatchmakerService();

/**
 * Helper: แปลง longtext player_ids เป็น Array
 */
const castMatch = (match) => {
    if (!match) return null;
    return {
        ...match,
        player_ids: typeof match.player_ids === 'string' 
            ? JSON.parse(match.player_ids) 
            : (Array.isArray(match.player_ids) ? match.player_ids : [])
    };
};

// [GET] /api/matches (index)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM matches ORDER BY played_at DESC LIMIT 100");
        res.json({ matches: rows.map(castMatch) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] /api/matches
router.post('/', async (req, res) => {
    // 1. ดึงข้อมูลจาก Body (รองรับ round: 0 และ provisional: true)
    const { round, court_id, player_ids, result: customResult } = req.body;

    // 2. Validation: แก้ไขให้ยอมรับ round: 0 (ใช้ !== undefined)
    const isValidRound = round !== undefined && round !== null;
    const isValidPlayers = Array.isArray(player_ids) && player_ids.length === 4;

    if (!isValidRound || !court_id || !isValidPlayers) {
        return res.status(422).json({ 
            message: "The given data was invalid.", 
            errors: { player_ids: ["Required exactly 4 players and a valid round."] } 
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // [A] บันทึก Match (จำลอง $match = MatchModel::create(...))
        const finalStatus = customResult || 'playing';
        const [mResult] = await connection.execute(
            "INSERT INTO matches (round, court_id, player_ids, result, played_at) VALUES (?, ?, ?, ?, NOW())",
            [round, court_id, JSON.stringify(player_ids), finalStatus]
        );
        const matchId = mResult.insertId;

        // [B] Update Players (เหมือน Player::whereIn(...)->increment(...))
        const placeholders = player_ids.map(() => '?').join(',');
        await connection.execute(
            `UPDATE players SET matches = matches + 1, last_played_round = ? WHERE id IN (${placeholders})`,
            [round, ...player_ids]
        );

        // [C] Update Court (เหมือน Court::where(...)->update(...))
        await connection.execute(
            `UPDATE courts SET status = 'occupied', match_id = ?, current_players = ?, finished = 0 WHERE id = ?`,
            [matchId, JSON.stringify(player_ids), court_id]
        );

        await connection.commit();

        // [D] Generate Next Queue (เหมือน $maker->generate(...))
        // ใช้ MatchmakerService ที่เราเขียนไว้ก่อนหน้านี้
        const groups = await maker.generate({
            rules_strict: true,
            cooldown: 1,
            next_show: 10
        });

        // 3. Return JSON ตอบกลับแบบเดียวกับ Laravel
        return res.status(201).json({ 
            match: {
                id: matchId,
                round,
                court_id,
                player_ids,
                result: finalStatus
            }, 
            newQueue: groups 
        });

    } catch (err) {
        await connection.rollback();
        console.error('Match store error:', err);
        return res.status(500).json({ error: 'Server error', message: err.message });
    } finally {
        connection.release();
    }
});

// [PATCH] /api/matches/:id (update) - จบแมตช์
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { round, court_id, player_ids } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. อัปเดต Match เป็น finished
        await connection.execute(
            "UPDATE matches SET result = 'finished', played_at = NOW() WHERE id = ?",
            [id]
        );

        // 2. อัปเดต last_played_round ของผู้เล่น
        const placeholders = player_ids.map(() => '?').join(',');
        await connection.execute(
            `UPDATE players SET last_played_round = ? WHERE id IN (${placeholders})`,
            [round, ...player_ids]
        );

        // 3. ปล่อยสนาม
        await connection.execute(
            "UPDATE courts SET status = 'available', current_players = '[]', finished = 1, match_id = 0 WHERE id = ?",
            [court_id]
        );

        await connection.commit();

        const newQueue = await maker.generate({ next_show: 10 });
        const [allPlayers] = await connection.execute("SELECT * FROM players");

        res.json({ success: true, newQueue, players: allPlayers });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// [DELETE] /api/matches/:id (destroy) - ยกเลิกแมตช์
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [matches] = await connection.execute("SELECT * FROM matches WHERE id = ?", [id]);
        if (matches.length === 0) throw new Error("Match not found");
        const match = castMatch(matches[0]);

        // Revert matches count & last_round
        if (match.player_ids.length > 0) {
            const placeholders = match.player_ids.map(() => '?').join(',');
            await connection.execute(
                `UPDATE players SET matches = matches - 1, last_played_round = -1 WHERE id IN (${placeholders})`,
                match.player_ids
            );
        }

        // Free court
        await connection.execute(
            "UPDATE courts SET status = 'available', current_players = '[]', finished = 1 WHERE id = ?",
            [match.court_id]
        );

        await connection.execute("DELETE FROM matches WHERE id = ?", [id]);

        await connection.commit();
        
        const newQueue = await maker.generate({ next_show: 10 });
        res.json({ message: 'Match cancelled', newQueue });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;