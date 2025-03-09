// backend/src/routes/studentRoutes.ts
import express from "express";
import { addStudent, verifyStudent } from "../controllers/studentController";
import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";

const router = express.Router();

router.post("/add", authenticateToken, requireSubscribedAdmin, addStudent);
router.post("/verify/:id", authenticateToken, requireSubscribedAdmin, verifyStudent);

export default router;