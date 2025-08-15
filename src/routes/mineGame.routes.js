import { Router } from "express";
import { startGame, stopGame } from "../controllers/mineGame.controller.js";
import { handlePreviousUnfinishedSession } from "../middlewares/handlePreviousUnfinishedSession.middleware.js";

const router = Router()

router.route("/start").post(handlePreviousUnfinishedSession, startGame)
router.route("/stop").post(stopGame)

export default router