import { Router, Response } from "express";

import { supabase } from "../config/db";
import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";
import { requireMasterAdmin } from "../middleware/subscription";
import {
  createPlans,
  createRazorpaySubscription,
  deletePlans,
  getSubscriptionPlans,
  getSubscriptionStatus,
  razorpayWebhook,
  triggerWebhookManually,
  updatePlans,
} from "../controllers/subscriptionsController";

const router = Router();

//For Master Admin
router.post(
  "/plans",
  authenticateToken,
  requireSubscribedAdmin,
  requireMasterAdmin,
  createPlans
);

router.put(
  "/plans/:id",
  authenticateToken,
  requireSubscribedAdmin,
  requireMasterAdmin,
  updatePlans
);

router.delete(
  "/plans/:id",
  authenticateToken,
  requireSubscribedAdmin,
  requireMasterAdmin,
  deletePlans
);

//For Admin
router.get("/subscription-plans", authenticateToken, getSubscriptionPlans);

//Create Razorpay subscription (Admin)
router.post(
  "/create-subscription",
  authenticateToken,
  createRazorpaySubscription
);

//webhook
router.post("/webhook", razorpayWebhook);

router.get("/subscription-status", authenticateToken, getSubscriptionStatus);
router.post(
  "/trigger-webhook",
  authenticateToken,
  requireMasterAdmin,
  triggerWebhookManually
);
export default router;
