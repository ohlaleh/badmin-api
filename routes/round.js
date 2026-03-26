// backend/api/round.js
const express = require('express');
const db = require('../db'); // pool.promise()
const router = express.Router();

// GET /api/round
router.get('/', async (req, res) => {
  try {
  const [rows] = await db.query('SELECT COALESCE(MAX(round), 1) AS maxRound FROM matches');
  const nextRound = rows[0].maxRound + 1;
  res.json({ round: nextRound });
} catch (err) {
  res.status(500).json({ error: 'DB error' });
}
});

// POST /api/round
router.post('/', (req, res) => {
  const { round: newRound } = req.body;
  if (typeof newRound === 'number' && newRound >= 0) {
    round = newRound;
    res.json({ round });
  } else {
    res.status(400).json({ error: 'Invalid round value' });
  }
});

module.exports = router;