// backend/src/routes/authRoutes.ts
import express from "express";
import { link, qr } from "../controllers/paymentsController";
import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";

const router = express.Router();

router.post("/qr", authenticateToken, requireSubscribedAdmin, qr);
router.post("/link", authenticateToken, requireSubscribedAdmin, link);

export default router;
