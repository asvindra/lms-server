import express, { Request, Response } from "express";

import { authenticateToken } from "../middleware/auth";
import Razorpay from "razorpay";
import crypto from "crypto";
import { supabase } from "../config/db";

// Validate environment variables
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("Razorpay keys missing in environment variables");
  throw new Error("Razorpay keys not configured");
}

// Log keys for debugging (remove in production)
console.log("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const router = express.Router();

// Create a subscription plan (Master Admin)
export const createPlans = async (req: Request, res: Response) => {
  const {
    name,
    description,
    amount,
    billing_cycle,
    interval_count = 1,
  } = req.body;
  console.log("createPlans - Request body:", req.body); // Debug

  if (
    !name ||
    !amount ||
    !billing_cycle ||
    !["monthly", "yearly", "lifetime"].includes(billing_cycle) ||
    amount < 100
  ) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    const amountInPaise = Math.round(amount);
    const validPeriods = ["daily", "weekly", "monthly", "yearly"];
    const period = billing_cycle === "lifetime" ? "monthly" : billing_cycle;
    if (!validPeriods.includes(period)) {
      console.error(`Invalid period: ${period}`);
      return res
        .status(400)
        .json({ error: `Invalid billing cycle: ${billing_cycle}` });
    }

    const razorpayPayload = {
      period,
      interval: interval_count,
      item: {
        name,
        amount: amountInPaise,
        currency: "INR",
        description: description || "",
      },
      notes: {
        notes_key_1: "Created via Node.js backend",
        notes_key_2: `Plan: ${name}`,
      },
    };
    console.log(
      "Razorpay plan create payload:",
      JSON.stringify(razorpayPayload, null, 2)
    );

    const razorpayPlan = await razorpay.plans.create(razorpayPayload);
    console.log(
      "Razorpay plan response:",
      JSON.stringify(razorpayPlan, null, 2)
    );

    const { data, error } = await supabase
      .from("subscription_plans")
      .insert({
        name,
        description,
        amount: amountInPaise,
        currency: "INR",
        billing_cycle,
        interval_count,
        razorpay_plan_id: razorpayPlan.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", JSON.stringify(error, null, 2));
      return res
        .status(500)
        .json({ error: "Failed to create plan in Supabase" });
    }

    res.status(201).json(data);
  } catch (err: any) {
    console.error(
      "Razorpay error details:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    res.status(500).json({ error: "Failed to create plan" });
  }
};

// Update a subscription plan (Master Admin)
export const updatePlans = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    description,
    amount,
    billing_cycle,
    interval_count = 1,
  } = req.body;
  console.log("updatePlans - Request body:", req.body, "ID:", id); // Debug

  if (
    !name ||
    !amount ||
    !billing_cycle ||
    !["monthly", "yearly", "lifetime"].includes(billing_cycle) ||
    amount < 100
  ) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    const { data: existingPlan, error: fetchError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existingPlan) {
      console.error("Plan fetch error:", JSON.stringify(fetchError, null, 2));
      return res.status(404).json({ error: "Plan not found" });
    }

    const amountInPaise = Math.round(amount);
    const validPeriods = ["daily", "weekly", "monthly", "yearly"];
    const period = billing_cycle === "lifetime" ? "monthly" : billing_cycle;
    if (!validPeriods.includes(period)) {
      console.error(`Invalid period: ${period}`);
      return res
        .status(400)
        .json({ error: `Invalid billing cycle: ${billing_cycle}` });
    }

    const razorpayPayload = {
      period,
      interval: interval_count,
      item: {
        name,
        amount: amountInPaise,
        currency: "INR",
        description: description || "",
      },
      notes: {
        notes_key_1: "Updated via Node.js backend",
        notes_key_2: `Plan: ${name}`,
      },
    };
    console.log(
      "Razorpay plan create payload (update):",
      JSON.stringify(razorpayPayload, null, 2)
    );

    const newRazorpayPlan = await razorpay.plans.create(razorpayPayload);
    console.log(
      "Razorpay plan response (update):",
      JSON.stringify(newRazorpayPlan, null, 2)
    );

    const { data, error } = await supabase
      .from("subscription_plans")
      .update({
        name,
        description,
        amount: amountInPaise,
        billing_cycle,
        interval_count,
        razorpay_plan_id: newRazorpayPlan.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", JSON.stringify(error, null, 2));
      return res
        .status(500)
        .json({ error: "Failed to update plan in Supabase" });
    }

    res.json(data);
  } catch (err: any) {
    console.error(
      "Razorpay error details:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    res.status(500).json({ error: "Failed to update plan" });
  }
};

// Delete a subscription plan (Master Admin)
export const deletePlans = async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log("deletePlans - ID:", id); // Debug

  try {
    const { data: plan, error: fetchError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !plan) {
      console.error("Plan fetch error:", JSON.stringify(fetchError, null, 2));
      return res.status(404).json({ error: "Plan not found" });
    }

    const { error } = await supabase
      .from("subscription_plans")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase error:", JSON.stringify(error, null, 2));
      return res.status(500).json({ error: "Failed to delete plan" });
    }

    res.status(204).send();
  } catch (err: any) {
    console.error("Error:", JSON.stringify(err.message, null, 2));
    res.status(500).json({ error: "Failed to delete plan" });
  }
};

// Get all subscription plans (Admin)
export const getSubscriptionPlans = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(
        "id, name, description, amount, currency, billing_cycle, interval_count"
      );

    if (error) {
      console.error("Supabase error:", JSON.stringify(error, null, 2));
      return res.status(500).json({ error: "Failed to fetch plans" });
    }

    res.json(data);
  } catch (err: any) {
    console.error("Error:", JSON.stringify(err.message, null, 2));
    res.status(500).json({ error: "Failed to fetch plans" });
  }
};

export const createRazorpaySubscription = async (
  req: Request,
  res: Response
) => {
  const { plan_id, customer_email, customer_phone } = req.body;
  const user: any = req.user;
  console.log(
    "createRazorpaySubscription - Request body:",
    req.body,
    "User:",
    user
  ); // Debug

  try {
    const { data: plan, error: fetchError } = await supabase
      .from("subscription_plans")
      .select("razorpay_plan_id, billing_cycle")
      .eq("id", plan_id)
      .single();

    if (fetchError || !plan) {
      console.error("Plan fetch error:", JSON.stringify(fetchError, null, 2));
      return res.status(404).json({ error: "Plan not found" });
    }

    if (!plan.razorpay_plan_id) {
      return res.status(400).json({ error: "Plan not linked to Razorpay" });
    }

    const subscriptionPayload: any = {
      plan_id: plan.razorpay_plan_id,
      total_count: plan.billing_cycle === "lifetime" ? 1 : 12,
      customer_notify: 1,
      notify_info: {
        email: customer_email,
        phone: customer_phone,
      },
      notes: {
        notes_key_1: "Subscription created via Node.js backend",
        notes_key_2: `User: ${user.userId}`,
      },
    };
    console.log(
      "Razorpay subscription create payload:",
      JSON.stringify(subscriptionPayload, null, 2)
    );

    const subscription = await razorpay.subscriptions.create(
      subscriptionPayload
    );
    console.log(
      "Razorpay subscription response:",
      JSON.stringify(subscription, null, 2)
    );

    // Store pending subscription temporarily (optional, for tracking)
    const { error: tempError } = await supabase
      .from("pending_subscriptions")
      .insert({
        admin_id: user.userId,
        plan_id,
        razorpay_subscription_id: subscription.id,
        status: subscription.status,
        customer_email,
        customer_phone,
      });

    if (tempError) {
      console.error(
        "Supabase pending subscription error:",
        JSON.stringify(tempError, null, 2)
      );
      // Continue, as this is optional
    }

    res.json({
      subscription_id: subscription.id,
      razorpay_key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error(
      "Razorpay error details:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    res.status(500).json({ error: "Failed to create subscription" });
  }
};

// Razorpay webhook handler
export const razorpayWebhook = async (req: Request, res: Response) => {
  const webhookSecret: string = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const signature = req.headers["x-razorpay-signature"] as string;
  const body = JSON.stringify(req.body);
  console.log(
    "razorpayWebhook - Received - Headers:",
    JSON.stringify(req.headers, null, 2)
  );
  console.log("razorpayWebhook - Body:", body);

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error(
      "Invalid webhook signature. Expected:",
      expectedSignature,
      "Received:",
      signature
    );
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = req.body.event;
  const payload = req.body.payload;
  console.log(
    "Webhook event:",
    event,
    "Payload:",
    JSON.stringify(payload, null, 2)
  );

  try {
    switch (event) {
      case "subscription.charged":
      case "subscription.authenticated": {
        console.log("Processing subscription event:", event);
        const subscription = payload.subscription.entity;
        console.log(
          "Subscription entity:",
          JSON.stringify(subscription, null, 2)
        );

        const { data: pendingSub, error: pendingError } = await supabase
          .from("pending_subscriptions")
          .select("id, admin_id, plan_id, customer_email, customer_phone")
          .eq("razorpay_subscription_id", subscription.id)
          .single();

        if (pendingError || !pendingSub) {
          console.error(
            "Pending subscription not found for ID:",
            subscription.id,
            "Error:",
            JSON.stringify(pendingError || "No data", null, 2)
          );
          return res
            .status(404)
            .json({ error: "Pending subscription not found" });
        }

        console.log(
          "Found pending subscription:",
          JSON.stringify(pendingSub, null, 2)
        );

        // Prepare subscription data, excluding customer_email/phone if not in schema
        const subscriptionData: any = {
          admin_id: pendingSub.admin_id,
          plan_id: pendingSub.plan_id,
          razorpay_subscription_id: subscription.id,
          status: subscription.status,
          created_at: new Date().toISOString(),
        };

        // Only include customer_email and customer_phone if they exist
        if (pendingSub.customer_email) {
          subscriptionData.customer_email = pendingSub.customer_email;
        }
        if (pendingSub.customer_phone) {
          subscriptionData.customer_phone = pendingSub.customer_phone;
        }

        // Store in subscriptions table
        const { error: subError } = await supabase
          .from("subscriptions")
          .insert(subscriptionData);

        if (subError) {
          console.error(
            "Supabase subscription insert error:",
            JSON.stringify(subError, null, 2)
          );
          return res
            .status(500)
            .json({ error: "Failed to store subscription" });
        }

        // Update admin subscription status
        const { error: adminError } = await supabase
          .from("admin")
          .update({ is_subscribed: true, updated_at: new Date().toISOString() })
          .eq("id", pendingSub.admin_id);

        if (adminError) {
          console.error(
            "Supabase admin update error:",
            JSON.stringify(adminError, null, 2)
          );
          return res.status(500).json({ error: "Failed to update admin" });
        }

        // Remove from pending_subscriptions
        const { error: deleteError } = await supabase
          .from("pending_subscriptions")
          .delete()
          .eq("id", pendingSub.id);

        if (deleteError) {
          console.error(
            "Supabase delete pending error:",
            JSON.stringify(deleteError, null, 2)
          );
          return res
            .status(500)
            .json({ error: "Failed to delete pending subscription" });
        }

        console.log("Subscription processed successfully:", subscription.id);
        break;
      }
      case "subscription.cancelled":
      case "subscription.halted": {
        console.log("Processing subscription event:", event);
        const subscription = payload.subscription.entity;
        const { data: subData, error: subError } = await supabase
          .from("subscriptions")
          .select("admin_id")
          .eq("razorpay_subscription_id", subscription.id)
          .single();

        if (subError || !subData) {
          console.error(
            "Subscription not found:",
            JSON.stringify(subError || "No data", null, 2)
          );
          return res.status(404).json({ error: "Subscription not found" });
        }

        const { error } = await supabase
          .from("subscriptions")
          .update({
            status: subscription.status,
            updated_at: new Date().toISOString(),
          })
          .eq("razorpay_subscription_id", subscription.id);

        if (error) {
          console.error("Supabase error:", JSON.stringify(error, null, 2));
          return res
            .status(500)
            .json({ error: "Failed to update subscription" });
        }

        const { error: adminError } = await supabase
          .from("admin")
          .update({
            is_subscribed: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subData.admin_id);

        if (adminError) {
          console.error(
            "Supabase admin error:",
            JSON.stringify(adminError, null, 2)
          );
          return res.status(500).json({ error: "Failed to update admin" });
        }

        console.log("Subscription status updated:", subscription.id);
        break;
      }
      default:
        console.log("Unhandled webhook event:", event);
        break;
    }
  } catch (err: any) {
    console.error(
      "Webhook processing error:",
      JSON.stringify(err.message, null, 2)
    );
    return res.status(500).json({ error: "Failed to process webhook" });
  }

  res.status(200).json({ status: "Webhook processed" });
};

// Cleanup expired subscriptions
export const cleanupSubscriptions = async (req: Request, res: Response) => {
  try {
    // Remove pending subscriptions older than 24 hours
    const { error: pendingError } = await supabase
      .from("pending_subscriptions")
      .delete()
      .lt(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      );

    if (pendingError) {
      console.error(
        "Pending cleanup error:",
        JSON.stringify(pendingError, null, 2)
      );
      return res
        .status(500)
        .json({ error: "Failed to clean pending subscriptions" });
    }

    // Update subscriptions stuck in non-active states (optional)
    const { error: subError } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("status", "created")
      .lt(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      ); // 30 days

    if (subError) {
      console.error(
        "Subscription cleanup error:",
        JSON.stringify(subError, null, 2)
      );
      return res.status(500).json({ error: "Failed to clean subscriptions" });
    }

    res.status(200).json({ message: "Cleanup completed" });
  } catch (err: any) {
    console.error("Cleanup error:", JSON.stringify(err.message, null, 2));
    res.status(500).json({ error: "Cleanup failed" });
  }
};

// Get subscription status (Admin)
export const getSubscriptionStatus = async (req: Request, res: Response) => {
  const user: any = req.user;
  console.log("getSubscriptionStatus - User:", user);

  try {
    // Check admin subscription status
    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("is_subscribed")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin) {
      console.error("Admin fetch error:", JSON.stringify(adminError, null, 2));
      return res.status(404).json({ error: "Admin not found" });
    }

    // Check active subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("subscriptions")
      .select("id, plan_id, status, created_at")
      .eq("admin_id", user.userId)
      .in("status", ["active", "authenticated"]);

    if (subError) {
      console.error(
        "Subscription fetch error:",
        JSON.stringify(subError, null, 2)
      );
      return res.status(500).json({ error: "Failed to fetch subscriptions" });
    }

    // Check pending subscriptions
    const { data: pending, error: pendingError } = await supabase
      .from("pending_subscriptions")
      .select("id, plan_id, status, created_at")
      .eq("admin_id", user.userId);

    if (pendingError) {
      console.error(
        "Pending subscription fetch error:",
        JSON.stringify(pendingError, null, 2)
      );
      return res
        .status(500)
        .json({ error: "Failed to fetch pending subscriptions" });
    }

    res.json({
      is_subscribed: admin.is_subscribed,
      active_subscriptions: subscriptions || [],
      pending_subscriptions: pending || [],
    });
  } catch (err: any) {
    console.error("Error:", JSON.stringify(err.message, null, 2));
    res.status(500).json({ error: "Failed to fetch subscription status" });
  }
};

// Manual webhook trigger (Master Admin)
export const triggerWebhookManually = async (req: Request, res: Response) => {
  const { razorpay_subscription_id } = req.body;
  console.log(
    "triggerWebhookManually - Subscription ID:",
    razorpay_subscription_id
  );

  try {
    const { data: pendingSub, error: pendingError } = await supabase
      .from("pending_subscriptions")
      .select("id, admin_id, plan_id, customer_email, customer_phone")
      .eq("razorpay_subscription_id", razorpay_subscription_id)
      .single();

    if (pendingError || !pendingSub) {
      console.error(
        "Pending subscription not found:",
        JSON.stringify(pendingError || "No data", null, 2)
      );
      return res.status(404).json({ error: "Pending subscription not found" });
    }

    const subscription = { id: razorpay_subscription_id, status: "active" };

    const subscriptionData: any = {
      admin_id: pendingSub.admin_id,
      plan_id: pendingSub.plan_id,
      razorpay_subscription_id: subscription.id,
      status: subscription.status,
      created_at: new Date().toISOString(),
    };

    if (pendingSub.customer_email) {
      subscriptionData.customer_email = pendingSub.customer_email;
    }
    if (pendingSub.customer_phone) {
      subscriptionData.customer_phone = pendingSub.customer_phone;
    }

    const { error: subError } = await supabase
      .from("subscriptions")
      .insert(subscriptionData);

    if (subError) {
      console.error(
        "Supabase subscription insert error:",
        JSON.stringify(subError, null, 2)
      );
      return res.status(500).json({ error: "Failed to store subscription" });
    }

    const { error: adminError } = await supabase
      .from("admin")
      .update({ is_subscribed: true, updated_at: new Date().toISOString() })
      .eq("id", pendingSub.admin_id);

    if (adminError) {
      console.error(
        "Supabase admin update error:",
        JSON.stringify(adminError, null, 2)
      );
      return res.status(500).json({ error: "Failed to update admin" });
    }

    const { error: deleteError } = await supabase
      .from("pending_subscriptions")
      .delete()
      .eq("id", pendingSub.id);

    if (deleteError) {
      console.error(
        "Supabase delete pending error:",
        JSON.stringify(deleteError, null, 2)
      );
      return res
        .status(500)
        .json({ error: "Failed to delete pending subscription" });
    }

    console.log(
      "Manual webhook processed successfully:",
      razorpay_subscription_id
    );
    res.status(200).json({ message: "Subscription processed" });
  } catch (err: any) {
    console.error(
      "Manual webhook error:",
      JSON.stringify(err.message, null, 2)
    );
    res.status(500).json({ error: "Failed to process manual webhook" });
  }
};

export default router;
