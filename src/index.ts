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

const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "https://lms-ui-eta.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., curl, Postman)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/admin", configRoutes);
app.use("/api/admin/profile", adminRoutes);
app.use("/api/admin/student", studentRoutes);
app.use("/api/admin/seat", seatRoutes);
app.use("/api/admin/subscriptions", subscriptionRoutes);
app.use("/api/admin/payments", paymentsRoutes);

app.get("/", (req, res) => {
  res.send("Library Management Backend");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
