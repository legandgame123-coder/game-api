import ColorGameRound from '../models/ColorGameRound.model.js';
import Bet from '../models/Bet.model.js';
import {User} from "../models/user.model.js"
import {GameHistory} from "../models/gameHistory.model.js"

let currentRound = null;
let gameTimer = null;
const ROUND_DURATION = 60000; // 1 minute in milliseconds

// Game rules
const colorRules = {
  green: [1, 3, 7, 9],
  red: [2, 4, 6, 8],
  violet: [0, 5]
};

function getColorByNumber(number) {
  for (const [color, numbers] of Object.entries(colorRules)) {
    if (numbers.includes(number)) {
      return color;
    }
  }
  return 'violet'; // fallback
}

function getSizeByNumber(number) {
  return number >= 5 ? 'big' : 'small';
}

function generatePeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hour}${minute}${second}`;
}

export async function createNewRound() {
  try {
    const period = generatePeriod();
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + ROUND_DURATION);

    currentRound = new ColorGameRound({
      period,
      winningNumber: 0,
      winningColor: 'violet',
      size: 'small',
      startTime,
      endTime,
      isCompleted: false
    });

    await currentRound.save();
    return currentRound;
  } catch (error) {
    console.error('Error creating new round:', error);
    throw error;
  }
}

export async function completeCurrentRound() {
  if (!currentRound) return null;

  try {
    const winningNumber = Math.floor(Math.random() * 10);
    const winningColor = getColorByNumber(winningNumber);
    const size = getSizeByNumber(winningNumber);

    currentRound.winningNumber = winningNumber;
    currentRound.winningColor = winningColor;
    currentRound.size = size;
    currentRound.isCompleted = true;

    await currentRound.save();

    // Process bets
    await processBets(currentRound);

    return currentRound;
  } catch (error) {
    console.error('Error completing round:', error);
    throw error;
  }
}

async function processBets(round) {
  try {
    const bets = await Bet.find({ period: round.period });

    for (const bet of bets) {
      let isWon = false;
      let payout = 0;

      switch (bet.betType) {
        case 'color':
          isWon = bet.betValue === round.winningColor;
          payout = isWon ? bet.amount * bet.multiplier * (bet.betValue === 'violet' ? 4.5 : 2) : 0;
          break;
        case 'number':
          isWon = parseInt(bet.betValue) === round.winningNumber;
          payout = isWon ? bet.amount * bet.multiplier * 9 : 0;
          break;
        case 'size':
          isWon = bet.betValue === round.size;
          payout = isWon ? bet.amount * bet.multiplier * 2 : 0;
          break;
      }

      const user = await User.findById(bet.userId);
      if (user) {
        if (isWon && payout > 0) {
          user.walletBalance += payout; // Add winnings
        }
        await user.save();
      }

      bet.isWon = isWon;
      bet.payout = payout;
      await bet.save();

      await GameHistory.create({
        userId: bet.userId,
        gameType: "color",
        result: isWon ? "win" : "loss",
        betAmount: bet.amount,
        payoutAmount: payout,
        win: isWon,
        roundId: round._id?.toString() || null,
      });
    }
  } catch (error) {
    console.error('Error processing bets:', error);
  }
}

export function initializeGameTimer(io) {
  async function startGameLoop() {
    try {
      // Create new round
      await createNewRound();
      console.log(`New round started: ${currentRound.period}`);

      // Broadcast new round to all clients
      io.emit('newRound', {
        period: currentRound.period,
        startTime: currentRound.startTime,
        endTime: currentRound.endTime,
        duration: ROUND_DURATION
      });

      // Start countdown
      let timeLeft = ROUND_DURATION / 1000; // seconds
      const countdown = setInterval(() => {
        timeLeft--;
        io.emit('countdown', { timeLeft });

        if (timeLeft <= 0) {
          clearInterval(countdown);
        }
      }, 1000);

      // Set timer to complete round
      gameTimer = setTimeout(async () => {
        try {
          const completedRound = await completeCurrentRound();
          console.log(`Round completed: ${completedRound.period}, Winner: ${completedRound.winningNumber}`);

          // Broadcast result to all clients
          io.emit('roundResult', {
            period: completedRound.period,
            winningNumber: completedRound.winningNumber,
            winningColor: completedRound.winningColor,
            size: completedRound.size
          });

          // Wait 5 seconds before starting new round
          setTimeout(startGameLoop, 5000);
        } catch (error) {
          console.error('Error in game loop:', error);
          setTimeout(startGameLoop, 5000);
        }
      }, ROUND_DURATION);

    } catch (error) {
      console.error('Error starting game loop:', error);
      setTimeout(startGameLoop, 5000);
    }
  }

  // Start the first round
  startGameLoop();
}

export async function getCurrentRound() {
  if (!currentRound) {
    return null;
  }

  const now = new Date();
  const timeLeft = Math.max(0, Math.floor((currentRound.endTime - now) / 1000));

  return {
    period: currentRound.period,
    startTime: currentRound.startTime,
    endTime: currentRound.endTime,
    timeLeft,
    isActive: timeLeft > 0
  };
}

export async function placeBet(betData) {
  try {
    const user = await User.findById(betData.userId);
    if (!user) throw new Error("User not found");

    if (user.walletBalance < betData.amount) {
      throw new Error("Insufficient wallet balance");
    }

    // Deduct the amount
    user.walletBalance -= betData.amount;
    await user.save();

    const bet = new Bet(betData);
    await bet.save();
    return bet;
  } catch (error) {
    console.error('Error placing bet:', error);
    throw error;
  }
}

export async function getGameHistory(limit = 50) {
  try {
    const history = await ColorGameRound.find({ isCompleted: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('period winningNumber winningColor size createdAt');

    return history;
  } catch (error) {
    console.error('Error fetching game history:', error);
    throw error;
  }
}

export async function getUserBets(userId, limit = 50) {
  try {
    const bets = await Bet.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('period');

    return bets;
  } catch (error) {
    console.error('Error fetching user bets:', error);
    throw error;
  }
}