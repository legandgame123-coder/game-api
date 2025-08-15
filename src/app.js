import { seedDefaultAdmin } from "./utils/seedAdmin.js";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors"

const app = express()

// const instance = new Razorpay({
//   key_id: process.env.RAZORPAY_API_KEY,
//   key_secret: process.env.RAZORPAY_API_SECRET,
// });

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser())
seedDefaultAdmin();

// //Routes import
import userRouter from "./routes/user.routes.js"
import otpRouter from "./routes/otp.routes.js"
import walletRouter from "./routes/wallet.routes.js"
import adminRouter from "./routes/admin.routes.js"
import chickenGameRouter from "./routes/chickenRoad.routes.js"
import paymentRouter from "./routes/payment.routes.js"
import telegramRoute from "./routes/telegramBot.routes.js"
import mineGameRouter from "./routes/mineGame.routes.js"
import colorGameRouter from "./routes/ColorGame.routes.js"
import Razorpay from "razorpay";

// //Routes Declaration
app.use("/api/v1/users", userRouter)
app.use("/api/v1/otp", otpRouter)
app.use("/api/v1/wallet", walletRouter)
app.use("/api/v1/admin", adminRouter)
app.use("/api/v1/chicken-road", chickenGameRouter)
app.use("/api/v1/mine", mineGameRouter)
app.use("/api/v1/upi", paymentRouter)
app.use("/api/v1/color", colorGameRouter)
app.use("/api/v1/telegram", telegramRoute)

export { app }