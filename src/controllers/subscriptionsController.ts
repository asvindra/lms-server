import { Router, Response } from "express";
import Razorpay from "razorpay";

import crypto from "crypto";
import { supabase } from "../config/db";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Mock plans (store in Supabase for production)
const plans = [
  {
    id: "plan_basic",
    name: "Basic",
    amount: 99900,
    description: "Basic admin access with payment collection",
    interval: 1,
    period: "month",
  },
  {
    id: "plan_pro",
    name: "Pro",
    amount: 199900,
    description: "Advanced admin access with analytics",
    interval: 1,
    period: "month",
  },
];

// GET /api/subscriptions/plans
export const getPlans = async (req: any, res: Response) => {
  try {
    res.json({ plans });
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// POST /api/subscriptions
export const subscribePlans = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { planId } = req.body;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return res.status(400).json({ error: "Invalid plan" });

    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (existingSub)
      return res.status(400).json({ error: "Active subscription exists" });

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId, // Sync with Razorpay plans in production
      customer_notify: 1,
      total_count: 12, // 1 year
    });

    const { data: newSub, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        plan_id: planId,
        razorpay_subscription_id: subscription.id,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("users").update({ role: "admin" }).eq("id", userId);

    res.json({
      subscriptionId: newSub.id,
      razorpayOptions: {
        key: process.env.RAZORPAY_KEY_ID,
        subscription_id: subscription.id,
        name: plan.name,
        amount: plan.amount,
        currency: "INR",
        description: plan.description,
      },
    });
  } catch (err) {
    console.error("Error creating subscription:", err);
    res.status(500).json({ error: "Server error" });
  }
};
// POST /api/subscriptions/verify
export const verifySubscription = async (req: any, res: Response) => {
  try {
    const { subscriptionId, paymentResponse } = req.body;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const key: any = process.env.RAZORPAY_KEY_SECRET;
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = paymentResponse;
    const generatedSignature = crypto
      .createHmac("sha256", key)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "active" })
      .eq("id", subscriptionId)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ message: "Subscription verified" });
  } catch (err) {
    console.error("Error verifying subscription:", err);
    res.status(500).json({ error: "Server error" });
  }
};
// POST /api/subscriptions/webhook
export const webhookSubscription = async (req: any, res: Response) => {
  try {
    const webhookSecret: any = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const { event, payload } = req.body;
    if (event === "subscription.charged") {
      const subscriptionId = payload.subscription.entity.id;
      await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("razorpay_subscription_id", subscriptionId);
    } else if (event === "subscription.cancelled") {
      const subscriptionId = payload.subscription.entity.id;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("razorpay_subscription_id", subscriptionId)
        .single();

      if (sub) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("razorpay_subscription_id", subscriptionId);

        await supabase
          .from("users")
          .update({ role: "user" })
          .eq("id", sub.user_id);
      }
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Error in webhook:", err);
    res.status(500).json({ error: "Server error" });
  }
};
