// backend/src/controllers/authController.ts
import { Request, Response } from "express";
import { supabase } from "../config/db";
import { sendOtpEmail } from "../config/email";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const signupAdmin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { data: existingAdmin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("email", email)
      .single();

    if (adminError && adminError.code !== "PGRST116") {
      return res.status(500).json({ error: adminError.message });
    }

    if (existingAdmin && existingAdmin.is_verified) {
      return res.status(400).json({ error: "Admin already registered" });
    }

    const { data: existingStudent, error: studentError } = await supabase
      .from("student")
      .select("*")
      .eq("email", email)
      .single();

    if (studentError && studentError.code !== "PGRST116") {
      return res.status(500).json({ error: studentError.message });
    }

    if (existingStudent) {
      return res.status(400).json({ error: "Email already used by a student" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingAdmin) {
      const { error: updateError } = await supabase
        .from("admin")
        .update({ otp, otp_expires: otpExpires, password: hashedPassword })
        .eq("email", email);
      if (updateError) return res.status(500).json({ error: updateError.message });
    } else {
      const { error: insertError } = await supabase.from("admin").insert({
        email,
        password: hashedPassword,
        otp,
        otp_expires: otpExpires,
        is_master: false,
        is_verified: false,
      });
      if (insertError) return res.status(500).json({ error: insertError.message });
    }

    await sendOtpEmail(email, otp);
    res.json({ message: "OTP sent to your email. Please verify to complete signup." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { email, otp, password } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  try {
    let user, tableName, role;
    const { data: adminUser, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("email", email)
      .single();

    if (adminError && adminError.code !== "PGRST116") {
      return res.status(500).json({ error: adminError.message });
    }

    if (adminUser) {
      user = adminUser;
      tableName = "admin";
      role = "admin";
    } else {
      const { data: studentUser, error: studentError } = await supabase
        .from("student")
        .select("*")
        .eq("email", email)
        .single();

      if (studentError && studentError.code !== "PGRST116") {
        return res.status(500).json({ error: studentError.message });
      }

      if (!studentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      user = studentUser;
      tableName = "student";
      role = "student";
    }

    console.log("user",user,otp);
    
    if (user.otp !== otp || new Date(user.otp_expires) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    if (tableName === "admin" && !user.is_verified) {
      // Signup verification
      const updates = { otp: null, otp_expires: null, is_verified: true };
      const { error: updateError } = await supabase
        .from("admin")
        .update(updates)
        .eq("email", email);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: "admin",
          isSubscribed: user.is_subscribed,
          isMaster: user.is_master,
        },
        process.env.JWT_SECRET as string,
        { expiresIn: "1h" }
      );

      res.json({
        message: "Signup successful",
        token,
        user: { id: user.id, email: user.email, role: "admin" },
      });
    } else {
      // Forgot-password verification (for admins or verified students)
      if (tableName === "student" && !user.is_verified) {
        return res.status(403).json({ error: "Student must be verified by an admin" });
      }

      if (!password) {
        return res.status(400).json({ error: "New password is required for password reset" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const updates = { otp: null, otp_expires: null, password: hashedPassword };

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updates)
        .eq("email", email);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ message: "Password reset successful! Please log in." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    let user, tableName, role;
    const { data: adminUser, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("email", email)
      .single();

    if (adminError && adminError.code !== "PGRST116") {
      return res.status(500).json({ error: adminError.message });
    }

    if (adminUser) {
      user = adminUser;
      tableName = "admin";
      role = "admin";
    } else {
      const { data: studentUser, error: studentError } = await supabase
        .from("student")
        .select("*")
        .eq("email", email)
        .single();

      if (studentError && studentError.code !== "PGRST116") {
        return res.status(500).json({ error: studentError.message });
      }

      if (!studentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      user = studentUser;
      tableName = "student";
      role = "student";
    }

    if (tableName === "student" && !user.is_verified) {
      return res.status(403).json({ error: "Student must be verified by an admin" });
    }

    if (!user.password) {
      return res.status(400).json({ error: "No password set. Please use forgot-password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    console.log("tableName: " + tableName);
    
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role,
        isSubscribed: tableName === "admin" ? user.is_subscribed : undefined,
        hasPaid: tableName === "student" ? user.has_paid : undefined,
        isMaster: tableName === "admin" ? user.is_master : undefined,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, email: user.email, role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    let user, tableName;
    const { data: adminUser, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("email", email)
      .single();

    if (adminError && adminError.code !== "PGRST116") {
      return res.status(500).json({ error: adminError.message });
    }

    if (adminUser) {
      user = adminUser;
      tableName = "admin";
    } else {
      const { data: studentUser, error: studentError } = await supabase
        .from("student")
        .select("*")
        .eq("email", email)
        .single();

      if (studentError && studentError.code !== "PGRST116") {
        return res.status(500).json({ error: studentError.message });
      }

      if (!studentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      user = studentUser;
      tableName = "student";
    }

    if (tableName === "student" && !user.is_verified) {
      return res.status(403).json({ error: "Student must be verified by an admin" });
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const { error: updateError } = await supabase
      .from(tableName)
      .update({ otp, otp_expires: otpExpires })
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    await sendOtpEmail(email, otp);
    res.json({ message: "OTP sent to your email. Please verify to reset password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};