const db = require('../db');

class MatchmakerService {
    /**
     * ดึงคิวที่บันทึกไว้ (เผื่อกรณีมีการเก็บคิวถาวรใน DB หรือ Redis)
     * ปัจจุบันคืนค่าเป็น Array ว่างตาม Logic เดิมใน PHP
     */
    async currentQueue() {
        return [];
    }

    /**
     * generate($opts)
     * สร้างกลุ่มผู้เล่นสำหรับการแข่งขันรอบถัดไป
     */
    async generate(opts = {}) {
        const rulesStrict = opts.rules_strict !== undefined ? opts.rules_strict : true;
        const cooldown = opts.cooldown !== undefined ? opts.cooldown : 1;
        const nextShow = opts.next_show || 10;

        try {
            // 1. หา Busy Players: ดึงผู้เล่นที่ "ติดแข่ง" อยู่ในสนามทั้งหมด
            const [courts] = await db.execute("SELECT current_players FROM courts");
            
            let busyIds = [];
            courts.forEach(court => {
                if (court.current_players) {
                    // รองรับทั้งแบบ JSON Object และ String จาก TiDB
                    const players = typeof court.current_players === 'string' 
                        ? JSON.parse(court.current_players) 
                        : court.current_players;
                    
                    if (Array.isArray(players)) {
                        busyIds = [...busyIds, ...players];
                    }
                }
            });

            // 2. ดึง Available Players: เฉพาะคนที่ play_status = 'active' และไม่ติดแข่ง
            let query = "SELECT * FROM players WHERE play_status = 'active'";
            let params = [];

            if (busyIds.length > 0) {
                const placeholders = busyIds.map(() => '?').join(',');
                query += ` AND id NOT IN (${placeholders})`;
                params = busyIds;
            }

            // เพิ่ม Logic ความยุติธรรม: คนแข่งน้อย (matches) และรอนาน (last_played_round) ได้สิทธิ์ก่อน
            query += " ORDER BY matches ASC, last_played_round ASC";
            
            const [availableRows] = await db.execute(query, params);

            // 3. จัดกลุ่ม (Grouping Logic)
            const groups = [];
            let pool = [...availableRows];

            // วนลูปสร้างกลุ่มละ 4 คน จนกว่าคนจะหมดหรือครบจำนวนที่ต้องการโชว์
            while (pool.length >= 4 && groups.length < nextShow) {
                const chunk = pool.splice(0, 4); // ดึง 4 คนแรกออกมา
                
                // แปลงฟิลด์ JSON ของผู้เล่น (เช่น teammates) ให้เป็น Array
                const group = chunk.map(player => ({
                    ...player,
                    teammates: typeof player.teammates === 'string' 
                        ? JSON.parse(player.teammates) 
                        : (player.teammates || [])
                }));
                
                groups.push(group);
            }

            return groups;

        } catch (err) {
            console.error('MatchmakerService Error:', err);
            return []; // คืนค่า Array ว่างหากเกิด Error เพื่อไม่ให้หน้าเว็บล่ม
        }
    }

    /**
     * forceFill($nextShow)
     * บังคับจัดคิวโดยไม่สนกฎเหล็ก (Rules Strict = false)
     */
    async forceFill(nextShow = 10) {
        return this.generate({ rules_strict: false, next_show: nextShow });
    }
}

module.exports = MatchmakerService;