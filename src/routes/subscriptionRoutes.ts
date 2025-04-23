import { Router, Response } from "express";

import { supabase } from "../config/db";
import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";
import {
  getPlans,
  subscribePlans,
  verifySubscription,
  webhookSubscription,
} from "../controllers/subscriptionsController";

const router = Router();

router.post(
  "/verify",
  authenticateToken,
  requireSubscribedAdmin,
  verifySubscription
);
router.post(
  "/subscribe-plan",
  authenticateToken,
  requireSubscribedAdmin,
  subscribePlans
);
router.get("/get-plans", authenticateToken, requireSubscribedAdmin, getPlans);
router.post(
  "/webhook",
  authenticateToken,
  requireSubscribedAdmin,
  webhookSubscription
);

export default router;
