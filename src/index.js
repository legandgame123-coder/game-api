import dotenv from "dotenv"
import connectDB from "./db/index.js";
import http from "http";
import { Server } from "socket.io";
import { app } from "./app.js";
import "./bots/telegramBot.js";
import aviatorSocketHandler from "./sockets/aviator.socket.js";
import { initializeGameTimer } from "./controllers/colorGame.controller.js";
import { initializeColorGameTimer } from "./controllers/aviatorGame.controller.js";

dotenv.config({
  path: './.env'
})

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Update with frontend URL in production
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  //aviatorSocketHandler(io, socket); // <-- Handle Aviator game socket logic here

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

connectDB()
  .then(() => {
    initializeGameTimer(io)
    initializeColorGameTimer(io)
    server.on("error", (error) => {
      console.log("❌ Server Error : ", error);
      throw error
    })
    server.listen(process.env.PORT || 8000, () => {
      console.log(`⚙️  Server is running at port : ${process.env.PORT}`);
    })
  })
  .catch((error) => {
    console.log("MONGODB connection failed !! ", error);
  })