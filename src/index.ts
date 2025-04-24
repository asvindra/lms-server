// backend/src/index.ts
import express from "express";
// import "dotenv/config";
import dotenv from "dotenv";
import fs from "fs";
import authRoutes from "./routes/authRoutes";
import studentRoutes from "./routes/studentRoutes";
import cors from "cors";
import configRoutes from "./routes/configRoutes";
import seatRoutes from "./routes/seatRoutes";
import adminRoutes from "./routes/adminRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import paymentsRoutes from "./routes/paymentRoutes";

const app = express();
// const env = process.env.NODE_ENV || "development";
// const envFilePath = `.env.${env}`;

// if (fs.existsSync(envFilePath)) {
//   console.log(`Loading environment file: ${envFilePath}`);
//   dotenv.config({ path: envFilePath });
// } else {
//   console.error(`Environment file not found: ${envFilePath}`);
//   dotenv.config(); // Fallback to default .env
// }
// dotenv.config({ path: `.env.${env}` });
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:3000", // Your Next.js app
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // If using cookies
  })
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/admin", configRoutes);
app.use("/api/admin/profile", adminRoutes);
app.use("/api/admin/student", studentRoutes);
app.use("/api/admin/seat", seatRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/payments", paymentsRoutes);

app.get("/", (req, res) => {
  res.send("Library Management Backend");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
