import express from 'express';
import {
  placeBet,
  getUserBets,
  cashOut
} from '../controllers/aviatorGame.controller.js';

const router = express.Router();

router.post('/bet', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const io = req.app.get('io'); // assuming you stored io in app locals
        const result = await placeBet({ userId, amount }, io);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/cashout', async (req, res) => {
    try {
        const { userId } = req.body;
        const io = req.app.get('io');
        const result = await cashOut(userId, io);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/user/:userId/bets', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const bets = await getUserBets(userId, limit);
    res.json({ success: true, data: bets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;