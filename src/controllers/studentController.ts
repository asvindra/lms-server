import { Request, Response } from "express";
import { supabase } from "../config/db";
import bcrypt from "bcrypt";

export const addStudent = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("id, is_verified, is_subscribed")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin) {
      return res.status(403).json({ error: "Admin not found" });
    }
    if (!admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }
    if (!admin.is_subscribed) {
      return res.status(403).json({ error: "Admin must be subscribed" });
    }

    const {
      email,
      name,
      mobileNo,
      aadharNo,
      address,
      fatherName,
      joiningDate,
      gender,
      paymentMode,
      paymentDone,
      shiftIds,
      isSubscribed,
    } = req.body;

    // Validate required fields
    if (!email || !name || !shiftIds || shiftIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Email, name, and at least one shift are required" });
    }

    // Check email uniqueness
    const { data: existingAdmin, error: adminCheckError } = await supabase
      .from("admin")
      .select("id")
      .eq("email", email)
      .single();

    if (adminCheckError && adminCheckError.code !== "PGRST116") {
      return res.status(500).json({ error: adminCheckError.message });
    }
    if (existingAdmin) {
      return res.status(400).json({ error: "Email already used by an admin" });
    }

    const { data: existingStudent, error: studentCheckError } = await supabase
      .from("students")
      .select("id")
      .eq("email", email)
      .single();

    if (studentCheckError && studentCheckError.code !== "PGRST116") {
      return res.status(500).json({ error: studentCheckError.message });
    }
    if (existingStudent) {
      return res
        .status(400)
        .json({ error: "Email already in use by another student" });
    }

    // Set default password
    const defaultPassword = "Student@123";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Fetch shifts for fee calculation
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, fees")
      .eq("admin_id", admin.id)
      .in("id", shiftIds);

    if (shiftsError || !shifts || shifts.length !== shiftIds.length) {
      return res.status(400).json({ error: "Invalid shift selection" });
    }

    // Insert student with default password
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        email,
        name,
        mobile_no: mobileNo,
        aadhar_no: aadharNo,
        address,
        father_name: fatherName,
        joining_date: joiningDate,
        gender,
        payment_mode: paymentMode,
        payment_done: paymentDone || false,
        admin_id: admin.id,
        is_verified: true,
        is_subscribed: paymentDone || isSubscribed || false,
        password: hashedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (studentError) {
      return res.status(500).json({ error: studentError.message });
    }

    // Calculate monthly fee with discounts
    const { data: discounts, error: discountsError } = await supabase
      .from("shift_discounts")
      .select("min_shifts, discount_percentage")
      .eq("admin_id", admin.id);

    if (discountsError) {
      return res.status(500).json({ error: discountsError.message });
    }

    const totalFee = shifts.reduce(
      (sum: number, shift: any) => sum + shift.fees,
      0
    );
    const discount = discounts.find(
      (d: any) => d.min_shifts === shiftIds.length
    );
    const monthlyFee = discount
      ? totalFee * (1 - discount.discount_percentage / 100)
      : totalFee;

    const studentShifts = shiftIds.map((shiftId: string) => ({
      student_id: student.id,
      shift_id: shiftId,
      monthly_fee: monthlyFee,
      created_at: new Date().toISOString(),
    }));

    const { error: shiftError } = await supabase
      .from("student_shifts")
      .insert(studentShifts);
    if (shiftError) {
      return res.status(500).json({ error: shiftError.message });
    }

    res.json({ message: "Student added successfully", student });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const updateStudent = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("id, is_verified, is_subscribed")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin) {
      return res.status(403).json({ error: "Admin not found" });
    }
    if (!admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }
    if (!admin.is_subscribed) {
      return res.status(403).json({ error: "Admin must be subscribed" });
    }

    const {
      id,
      email,
      name,
      mobileNo,
      aadharNo,
      address,
      fatherName,
      joiningDate,
      gender,
      paymentMode,
      paymentDone,
      shiftIds,
    } = req.body;

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("id", id)
      .eq("admin_id", admin.id)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check email uniqueness (excluding current student)
    const { data: existingStudent, error: emailCheckError } = await supabase
      .from("students")
      .select("id")
      .eq("email", email)
      .neq("id", id)
      .single();

    if (emailCheckError && emailCheckError.code !== "PGRST116") {
      return res.status(500).json({ error: emailCheckError.message });
    }
    if (existingStudent) {
      return res
        .status(400)
        .json({ error: "Email already in use by another student" });
    }

    const { data: existingAdmin, error: adminCheckError } = await supabase
      .from("admin")
      .select("id")
      .eq("email", email)
      .single();

    if (adminCheckError && adminCheckError.code !== "PGRST116") {
      return res.status(500).json({ error: adminCheckError.message });
    }
    if (existingAdmin) {
      return res.status(400).json({ error: "Email already used by an admin" });
    }

    // Fetch shifts for fee calculation
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, fees")
      .eq("admin_id", admin.id)
      .in("id", shiftIds);

    if (shiftsError || !shifts || shifts.length !== shiftIds.length) {
      return res.status(400).json({ error: "Invalid shift selection" });
    }

    const { error: updateError } = await supabase
      .from("students")
      .update({
        email,
        name,
        mobile_no: mobileNo,
        aadhar_no: aadharNo,
        address,
        father_name: fatherName,
        joining_date: joiningDate,
        gender,
        payment_mode: paymentMode,
        payment_done: paymentMode === "Offline" && paymentDone ? true : false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      if (updateError.code === "23505") {
        return res
          .status(400)
          .json({ error: "Email or Aadhar number already exists" });
      }
      return res.status(500).json({ error: updateError.message });
    }

    const { error: deleteShiftsError } = await supabase
      .from("student_shifts")
      .delete()
      .eq("student_id", id);

    if (deleteShiftsError) {
      return res.status(500).json({ error: deleteShiftsError.message });
    }

    const { data: discounts, error: discountsError } = await supabase
      .from("shift_discounts")
      .select("min_shifts, discount_percentage")
      .eq("admin_id", admin.id);

    if (discountsError) {
      return res.status(500).json({ error: discountsError.message });
    }

    const totalFee = shifts.reduce(
      (sum: number, shift: any) => sum + shift.fees,
      0
    );
    const discount = discounts.find(
      (d: any) => d.min_shifts === shiftIds.length
    );
    const monthlyFee = discount
      ? totalFee * (1 - discount.discount_percentage / 100)
      : totalFee;

    const studentShifts = shiftIds.map((shiftId: string) => ({
      student_id: id,
      shift_id: shiftId,
      monthly_fee: monthlyFee,
      created_at: new Date().toISOString(),
    }));

    const { error: shiftError } = await supabase
      .from("student_shifts")
      .insert(studentShifts);
    if (shiftError) {
      return res.status(500).json({ error: shiftError.message });
    }

    res.json({ message: "Student updated successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const deleteStudent = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("id, is_verified, is_subscribed")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin) {
      return res.status(403).json({ error: "Admin not found" });
    }
    if (!admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }
    if (!admin.is_subscribed) {
      return res.status(403).json({ error: "Admin must be subscribed" });
    }

    const { id } = req.body;

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("id", id)
      .eq("admin_id", admin.id)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const { error: deleteError } = await supabase
      .from("students")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    res.json({ message: "Student deleted successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const getStudents = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("id, is_verified, is_subscribed")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin) {
      return res.status(403).json({ error: "Admin not found" });
    }
    if (!admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }
    if (!admin.is_subscribed) {
      return res.status(403).json({ error: "Admin must be subscribed" });
    }

    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select(
        "id, email, name, mobile_no, aadhar_no, address, father_name, joining_date, gender, payment_mode, payment_done"
      )
      .eq("admin_id", admin.id);

    if (studentsError) {
      return res.status(500).json({ error: studentsError.message });
    }

    const { data: studentShifts, error: shiftsError } = await supabase
      .from("student_shifts")
      .select("student_id, shift_id, monthly_fee")
      .in(
        "student_id",
        students.map((s: any) => s.id)
      );

    if (shiftsError) {
      return res.status(500).json({ error: shiftsError.message });
    }

    const studentsWithShifts = students.map((student: any) => ({
      ...student,
      shifts: studentShifts.filter(
        (shift: any) => shift.student_id === student.id
      ),
    }));

    res.json({ students: studentsWithShifts });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const getConfiguredShifts = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("id, is_verified, is_subscribed")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin) {
      return res.status(403).json({ error: "Admin not found" });
    }
    if (!admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }
    if (!admin.is_subscribed) {
      return res.status(403).json({ error: "Admin must be subscribed" });
    }

    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, shift_number, start_time, end_time, fees")
      .eq("admin_id", admin.id)
      .order("shift_number", { ascending: true });

    if (shiftsError) {
      return res.status(500).json({ error: shiftsError.message });
    }
    if (!shifts || shifts.length === 0) {
      return res.status(404).json({ error: "No shifts configured" });
    }

    const { data: discounts, error: discountsError } = await supabase
      .from("shift_discounts")
      .select("min_shifts, discount_percentage")
      .eq("admin_id", admin.id)
      .order("min_shifts", { ascending: true });

    if (discountsError) {
      return res.status(500).json({ error: discountsError.message });
    }

    res.json({
      shifts,
      discounts: discounts || [],
    });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};
