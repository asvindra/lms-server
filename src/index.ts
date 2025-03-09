// backend/src/index.ts
import express from "express";
import  "dotenv/config";
import authRoutes from "./routes/authRoutes";
import studentRoutes from "./routes/studentRoutes";



const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);

app.get("/", (req, res) => {
  res.send("Library Management Backend");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});