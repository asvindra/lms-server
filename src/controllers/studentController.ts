// backend/src/controllers/studentController.ts
import { Request, Response } from "express";
import { supabase } from "../config/db";
import bcrypt from "bcrypt";

export const addStudent = async (req: Request, res: Response) => {
  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required" });
  }

  try {
    const { data: existingStudent, error: fetchError } = await supabase
      .from("student")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      return res.status(500).json({ error: fetchError.message });
    }

    if (existingStudent) {
      return res.status(400).json({ error: "Student already exists" });
    }

    const { data: existingAdmin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("email", email)
      .single();

    if (adminError && adminError.code !== "PGRST116") {
      return res.status(500).json({ error: adminError.message });
    }

    if (existingAdmin) {
      return res.status(400).json({ error: "Email already used by an admin" });
    }

    const defaultPassword = "student123";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const { data: student, error: insertError } = await supabase
      .from("student")
      .insert({
        name,
        email,
        added_by: req.user!.userId,
        is_verified:true,
        password: hashedPassword,
      })
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    res.status(201).json({
      message: "Student added successfully. Default password is 'student123'.",
      student,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const verifyStudent = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data: student, error } = await supabase
      .from("student")
      .update({ is_verified: true })
      .eq("id", id)
      .select()
      .single();

    if (error || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({ message: "Student verified successfully", student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};