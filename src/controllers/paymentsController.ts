import { Router, Response } from "express";
import Razorpay from "razorpay";
import { supabase } from "../config/db";

const router = Router();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /api/payments/link
export const link = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount, note } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount required" });

    const { data: user } = await supabase
      .from("users")
      .select("vpa, role")
      .eq("id", userId)
      .single();

    if (!user?.vpa) return res.status(400).json({ error: "User VPA not set" });
    if (user.role !== "admin")
      return res
        .status(403)
        .json({ error: "Only admin users can collect payments" });

    const paymentLink = await razorpay.paymentLink.create({
      amount: parseInt(amount) * 100, // Convert to paise
      currency: "INR",
      description: note || "Payment request",
      customer: {
        name: req.user.name || "User",
        email: req.user.email,
      },
      upi_link: true,
      notify: { sms: true, email: true },
      reminder_enable: true,
    });

    res.json({
      message: "Payment link created",
      paymentLink: paymentLink.short_url,
    });
  } catch (err) {
    console.error("Error creating payment link:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// POST /api/payments/qr
export const qr = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount required" });

    const { data: user } = await supabase
      .from("users")
      .select("vpa, role")
      .eq("id", userId)
      .single();

    if (!user?.vpa) return res.status(400).json({ error: "User VPA not set" });
    if (user.role !== "admin")
      return res
        .status(403)
        .json({ error: "Only admin users can collect payments" });

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=${user.vpa}&pn=${req.user.name}&am=${amount}&cu=INR`;

    res.json({ qrCodeUrl });
  } catch (err) {
    console.error("Error generating QR code:", err);
    res.status(500).json({ error: "Server error" });
  }
};
