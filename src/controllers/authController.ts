// backend/src/controllers/authController.ts
import { Request, Response } from "express";
import { supabase } from "../config/db";
import { sendOtpEmail } from "../config/email";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const generateOtp = () => 123456; // Math.floor(100000 + Math.random() * 900000);

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
      .from("students")
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
    const otpExpires = new Date(Date.now() + 60 * 60 * 1000); // 10 minutes

    if (existingAdmin) {
      const { error: updateError } = await supabase
        .from("admin")
        .update({ otp, otp_expires: otpExpires, password: hashedPassword })
        .eq("email", email);
      if (updateError)
        return res.status(500).json({ error: updateError.message });
    } else {
      const { error: insertError } = await supabase.from("admin").insert({
        email,
        password: hashedPassword,
        otp,
        otp_expires: otpExpires,
        is_master: false,
        is_verified: false,
      });
      if (insertError)
        return res.status(500).json({ error: insertError.message });
    }

    await sendOtpEmail(email, otp);
    res.json({
      message: "OTP sent to your email. Please verify to complete signup.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

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
        .from("students")
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
      tableName = "students";
      role = "student";
    }

    console.log("user", user, new Date(user.otp_expires), new Date());

    if (user.otp !== otp || new Date(user.otp_expires) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Use type assertion to allow additional properties
    const updates = { otp: null, otp_expires: null } as {
      otp: null;
      otp_expires: null;
      is_verified?: boolean;
    };
    if (tableName === "admin" && !user.is_verified) {
      updates.is_verified = true; // No error now
    } else if (tableName === "students" && !user.is_verified) {
      return res
        .status(403)
        .json({ error: "Student must be verified by an admin" });
    }

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updates)
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    if (tableName === "admin" && updates.is_verified) {
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
      res.json({ message: "OTP verified successfully", email });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
export const confirmPassword = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
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
        .from("students")
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
      tableName = "students";
    }

    // Ensure user is verified (for forgot-password flow)
    if (!user.is_verified) {
      return res.status(403).json({ error: "Account must be verified first" });
    }

    // Ensure OTP is cleared (indicating prior verification)
    if (user.otp || user.otp_expires) {
      return res.status(400).json({ error: "OTP verification required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const updates = { password: hashedPassword };

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updates)
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({ message: "Password reset successful! Please log in." });
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
        .from("students")
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
      tableName = "students";
      role = "student";
    }

    if (tableName === "students" && !user.is_verified) {
      return res
        .status(403)
        .json({ error: "Student must be verified by an admin" });
    }

    if (!user.password) {
      return res
        .status(400)
        .json({ error: "No password set. Please use forgot-password." });
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
        paymentDone:
          tableName === "students"
            ? user.payment_done || user.is_subscribed
            : undefined,
        isMaster: tableName === "admin" ? user.is_master : undefined,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role,
        is_subscribed: tableName === "admin" ? user.is_subscribed : undefined,
      },
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
        .from("students")
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
      tableName = "students";
    }

    if (tableName === "students" && !user.is_verified) {
      return res
        .status(403)
        .json({ error: "Student must be verified by an admin" });
    }

    const otp = generateOtp();

    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from(tableName)
      .update({ otp, otp_expires: otpExpires })
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    await sendOtpEmail(email, otp);
    res.json({
      message: "OTP sent to your email. Please verify to reset password.",
      email: email,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
