import { User } from "../models/user.model.js";
import { GameRound } from "../models/gameRound.model.js";
import { UserGameSession } from "../models/userGameSession.model.js";
import { GameHistory } from "../models/gameHistory.model.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const startGame = asyncHandler(async (req, res) => {
    const { betAmount, gameType, userId } = req.body;

    if (!betAmount || betAmount < 10) {
        throw new apiError(400, "Invalid bet amount");
    }

    if (!["chicken", "aviator", "color", "mining"].includes(gameType)) {
        throw new apiError(400, "Invalid game type");
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new apiError(404, "User not found");
    }

    if (user.walletBalance < betAmount) {
        throw new apiError(400, "Insufficient wallet balance");
    }

    // Deduct the bet amount
    user.walletBalance -= betAmount;
    await user.save();

    let multipliers = [];
    let roundId = null;
    const now = new Date();

    // 🔍 Check for an active admin round during the current time window
    const scheduledRound = await GameRound.findOne({
        gameType,
        startTime: { $lte: now },
        endTime: { $gt: now },
        status: { $in: ["scheduled", "active"] }
    }).sort({ startTime: -1 });
    console.log(now)

    if (scheduledRound) {
        multipliers = scheduledRound.multipliers;
        roundId = scheduledRound._id;
    } else {
        // 🔁 Generate fallback random multipliers
        multipliers = Array.from({ length: 24 }, (_, i) => i + 1);
        
        // Shuffle the array using Fisher-Yates algorithm
        for (let i = multipliers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [multipliers[i], multipliers[j]] = [multipliers[j], multipliers[i]];
        }       
    }

    // 💾 Save session
    const session = await UserGameSession.create({
        userId,
        gameType,
        betAmount,
        multipliers,
        roundId
    });

    return res.status(201).json(
        new apiResponse(201, {
            sessionId: session._id,
            firstMultiplier: multipliers[0],
            multipliers,
            stepIndex: 0,
            gameType
        }, "🎮 Game started successfully")
    );
});

const stopGame = asyncHandler(async (req, res) => {
    const { userId, payout, betAmount } = req.body;

    // 1. Get active session
    const session = await UserGameSession.findOne({
        userId,
        isStopped: false,
        isCrashed: false
    });

    if (!session) {
        throw new apiError(400, "No active session to stop");
    }

    // 3. Update wallet
    const user = await User.findById(userId);
    user.walletBalance += payout;
    await user.save();

    // 4. Update session
    session.isStopped = true;
    session.payoutAmount = payout;
    await session.save();

    if (payout == 0) {
        await GameHistory.create({
            userId,
            gameType: "mining",
            result: "loss",
            betAmount: betAmount,
            payoutAmount: 0,
            win: false,
            roundId: session.roundId?.toString() || null
        });
    } else {
        // 5. Log Game History
        await GameHistory.create({
            userId,
            gameType: "mining",
            result: "win",
            betAmount: betAmount,
            payoutAmount: payout,
            win: true,
            roundId: session.roundId?.toString() || null
        });
    }

    return res.status(200).json(
        new apiResponse(200, {
            payout,
            message: "✅ Game stopped successfully"
        })
    );
});

export {
    startGame,
    stopGame
}