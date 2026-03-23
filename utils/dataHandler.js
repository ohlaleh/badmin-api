/**
 * ช่วยจัดการฟิลด์ longtext ให้เป็น JSON Object/Array
 */
const castToJson = (data) => {
    if (!data) return [];
    try {
        return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
        return [];
    }
};

/**
 * ช่วยจัดการ Object/Array ให้เป็น String ก่อนลง longtext
 */
const castToString = (data) => {
    return JSON.stringify(data || []);
};

module.exports = { castToJson, castToString };