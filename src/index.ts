// backend/src/index.ts
import express from "express";
import "dotenv/config";
import authRoutes from "./routes/authRoutes";
import studentRoutes from "./routes/studentRoutes";
import cors from "cors";
import configRoutes from "./routes/configRoutes";

const app = express();
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
app.use("/api/students", studentRoutes);

app.get("/", (req, res) => {
  res.send("Library Management Backend");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
