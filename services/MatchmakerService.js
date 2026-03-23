const db = require('../db');

class MatchmakerService {
    // น้ำหนักคะแนนตามระดับฝีมือ (ดึงมาไว้เป็น Constant ของ Class)
    LEVEL_WEIGHTS = { 'P': 40, 'S': 30, 'N': 20, 'N-': 10 };

    /**
     * ดึงข้อมูลผู้เล่นที่ว่างอยู่ (ไม่อยู่ในสนาม และสถานะ active)
     */
    async getAvailablePlayers() {
        // 1. หา Busy Players จากสนาม
        const [courts] = await db.execute("SELECT current_players FROM courts");
        let busyIds = [];
        courts.forEach(c => {
            const ps = typeof c.current_players === 'string' ? JSON.parse(c.current_players) : c.current_players;
            if (Array.isArray(ps)) busyIds.push(...ps.map(p => p.id || p));
        });

        // 2. Query ผู้เล่นที่ว่าง
        let query = "SELECT * FROM players WHERE play_status = 'active'";
        let params = [];
        if (busyIds.length > 0) {
            const placeholders = busyIds.map(() => '?').join(',');
            query += ` AND id NOT IN (${placeholders})`;
            params = busyIds;
        }
        
        // เรียงลำดับความสำคัญพื้นฐาน: เล่นน้อยได้ก่อน, พักนานได้ก่อน
        query += " ORDER BY matches ASC, last_played_round ASC";
        const [rows] = await db.execute(query, params);
        return rows;
    }

    /**
     * จัดทีม 1+4 vs 2+3 (Logic เดียวกับ Frontend)
     */
    findBalancedOrdering(group) {
        if (!group || group.length !== 4) return group;
        
        const getW = (p) => this.LEVEL_WEIGHTS[p.level] || 10;
        
        // เรียงเก่ง -> อ่อน
        const sorted = [...group].sort((a, b) => getW(b) - getW(a));
        
        // คืนค่ารูปแบบ [TeamA_1, TeamA_2, TeamB_1, TeamB_2]
        return [sorted[0], sorted[3], sorted[1], sorted[2]];
    }

    /**
     * ตรวจสอบคู่ซ้ำ (Teammate Check)
     */
    hasRepeatTeammate(group) {
        const check = (p1, p2) => {
            if (!p1.teammates) return false;
            const mates = typeof p1.teammates === 'string' ? JSON.parse(p1.teammates) : p1.teammates;
            return mates[String(p2.id)] !== undefined;
        };
        // เช็คคู่ Team A (0-1) และ Team B (2-3)
        return check(group[0], group[1]) || check(group[2], group[3]);
    }

    async generate(opts = {}) {
        const nextShow = opts.next_show || 10;
        const rulesStrict = opts.rules_strict !== false; // Default เป็น True

        try {
            const availableRows = await this.getAvailablePlayers();
            const groups = [];
            let pool = [...availableRows];

            while (pool.length >= 4 && groups.length < nextShow) {
                // ดึง 4 คนแรกที่มี Priority สูงสุด (เล่นน้อยสุด)
                let candidate = pool.splice(0, 4);
                
                // 1. จัดสมดุลฝีมือ
                let balanced = this.findBalancedOrdering(candidate);
                
                // 2. ถ้ากฎเข้มงวด และเจอคู่ซ้ำ -> พยายามสลับคน (Shuffle ภายใน Pool ที่เหลือ)
                if (rulesStrict && this.hasRepeatTeammate(balanced)) {
                    // ถ้าใน pool ยังมีคนเหลือ ลองสลับเอาคนถัดไปมาเสียบแทนคนสุดท้ายของกลุ่ม
                    if (pool.length > 0) {
                        const backup = pool.splice(0, 1)[0]; // ดึงคนลำดับที่ 5 มา
                        pool.unshift(candidate.pop()); // เอาคนเดิมกลับไปรอใน pool
                        candidate.push(backup);
                        balanced = this.findBalancedOrdering(candidate);
                    }
                }

                groups.push(balanced);
            }

            return groups;
        } catch (err) {
            console.error('Matchmaker Error:', err);
            return [];
        }
    }
}

module.exports = new MatchmakerService();