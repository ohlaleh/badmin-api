const express = require('express');
const router = express.Router();
const db = require('../db'); // pool.promise()
const { castToJson } = require('../utils/dataHandler'); // Helper ที่เราสร้างไว้ก่อนหน้า

// POST /api/reset
router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. รีเซ็ตสถิติผู้เล่น (Matches = 0, Round = -1)
        await connection.execute(
            "UPDATE players SET matches = 0, last_played_round = -1"
        );

        // 2. ล้างข้อมูลสนาม (finished = true, status = available, current_players = [])
        // ใน MySQL/TiDB เราเซฟเป็น String '[]' สำหรับ longtext
        await connection.execute(
            "UPDATE courts SET finished = 1, status = 'available', current_players = '[]', match_id = 0"
        );

        // 3. ลบข้อมูล Match ทั้งหมด (ใช้ TRUNCATE เพื่อรีเซ็ต Auto Increment ID)
        // หมายเหตุ: ในบาง Transaction ระบบอาจไม่อนุญาตให้ TRUNCATE ให้ใช้ DELETE FROM แทนถ้าติด Error
        await connection.execute("DELETE FROM matches"); 
        // หากต้องการรีเซ็ต ID เริ่มที่ 1 ใหม่ ให้ใช้: await connection.execute("ALTER TABLE matches AUTO_INCREMENT = 1");

        await connection.commit();

        // 4. ดึงข้อมูลสถานะล่าสุดกลับไปให้ Frontend (Authoritative State)
        const [playersRaw] = await connection.execute("SELECT * FROM players ORDER BY matches ASC");
        const [courtsRaw] = await connection.execute("SELECT * FROM courts");

        // จัดการ Cast JSON สำหรับฟิลด์ longtext ก่อนส่งกลับ
        const players = playersRaw.map(p => ({
            ...p,
            teammates: castToJson(p.teammates)
        }));

        const courts = courtsRaw.map(c => ({
            ...c,
            current_players: castToJson(c.current_players)
        }));

        res.json({
            players: players,
            courts: courts,
            newQueue: [],
            round: 0,
            message: "System reset successfully."
        });

    } catch (err) {
        await connection.rollback();
        console.error('Reset error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;