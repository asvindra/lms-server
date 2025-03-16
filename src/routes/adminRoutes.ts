import express from "express";
import {
  getAdminProfile,
  updateAdminProfile,
} from "../controllers/adminController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.post("/update-profile", authenticateToken, updateAdminProfile);
router.get("/details", authenticateToken, getAdminProfile);

export default router;
