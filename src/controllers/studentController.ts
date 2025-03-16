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
      seatId,
    } = req.body;

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

    // Validate seat (if provided)
    let allocatedSeatId = null;
    if (seatId) {
      const { data: seat, error: seatError } = await supabase
        .from("seats")
        .select("id, reserved_by")
        .eq("id", seatId)
        .eq("admin_id", admin.id)
        .single();

      if (seatError || !seat) {
        return res.status(400).json({ error: "Invalid seat ID" });
      }
      if (seat.reserved_by) {
        return res.status(400).json({ error: "Seat is already allocated" });
      }
      allocatedSeatId = seat.id;
    }

    // Insert student with seat_id
    const defaultPassword = "Student@123";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, fees")
      .eq("admin_id", admin.id)
      .in("id", shiftIds);

    if (shiftsError || !shifts || shifts.length !== shiftIds.length) {
      return res.status(400).json({ error: "Invalid shift selection" });
    }

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
        is_subscribed: isSubscribed || false,
        password: hashedPassword,
        seat_id: allocatedSeatId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (studentError) {
      return res.status(500).json({ error: studentError.message });
    }

    // Update seat reserved_by (after student is inserted)
    if (allocatedSeatId) {
      const { error: seatUpdateError } = await supabase
        .from("seats")
        .update({ reserved_by: student.id })
        .eq("id", allocatedSeatId);

      if (seatUpdateError) {
        // Rollback student insertion if seat update fails
        await supabase.from("students").delete().eq("id", student.id);
        return res.status(500).json({ error: seatUpdateError.message });
      }
    }

    // Insert shifts
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
      .select("id, is_verified")
      .eq("id", user.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
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
      seatId,
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Student ID is required" });
    }

    // Fetch current student data to get the old seatId
    const { data: currentStudent, error: currentError } = await supabase
      .from("students")
      .select("seat_id")
      .eq("id", id)
      .eq("admin_id", admin.id)
      .single();

    if (currentError || !currentStudent) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Step 1: Update student details
    const { data: updatedStudent, error: studentError } = await supabase
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
        payment_done: paymentDone,
        seat_id: seatId,
      })
      .eq("id", id)
      .select()
      .single();

    if (studentError) {
      return res.status(500).json({ error: studentError.message });
    }

    // Step 2: Update seats table - clear old seat if changed
    if (currentStudent.seat_id && currentStudent.seat_id !== seatId) {
      const { error: clearError } = await supabase
        .from("seats")
        .update({ reserved_by: null })
        .eq("id", currentStudent.seat_id);

      if (clearError) {
        return res.status(500).json({ error: clearError.message });
      }
    }

    // Step 3: Reserve new seat if provided
    if (seatId) {
      const { error: reserveError } = await supabase
        .from("seats")
        .update({ reserved_by: id })
        .eq("id", seatId);

      if (reserveError) {
        return res.status(500).json({ error: reserveError.message });
      }
    }

    // Step 4: Delete existing student_shifts
    const { error: deleteError } = await supabase
      .from("student_shifts")
      .delete()
      .eq("student_id", id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    // Step 5: Insert new student_shifts if provided
    if (shiftIds && shiftIds.length > 0) {
      const { data: shifts, error: shiftsError } = await supabase
        .from("shifts")
        .select("id, fees")
        .in("id", shiftIds);

      if (shiftsError) {
        return res.status(500).json({ error: shiftsError.message });
      }

      const shiftInserts = shiftIds.map((shiftId: string) => ({
        student_id: id,
        shift_id: shiftId,
        monthly_fee: shifts.find((s: any) => s.id === shiftId)?.fees || 0,
      }));

      const { error: insertError } = await supabase
        .from("student_shifts")
        .insert(shiftInserts);

      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }
    }

    res.json({
      message: "Student updated successfully",
      student: updatedStudent,
    });
  } catch (err: any) {
    console.error("Error in updateStudent:", err);
    res.status(500).json({ error: err.message || "Server error" });
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
        "id, email, name, mobile_no, aadhar_no, address, father_name, joining_date, gender, payment_mode, payment_done, seat_id"
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

    const { data: seats, error: seatsError } = await supabase
      .from("seats")
      .select("id, seat_number, reserved_by")
      .eq("admin_id", admin.id);

    if (seatsError) {
      return res.status(500).json({ error: seatsError.message });
    }

    const studentsWithShiftsAndSeats = students.map((student: any) => ({
      ...student,
      shifts: studentShifts.filter(
        (shift: any) => shift.student_id === student.id
      ),
      seat: seats.find((seat: any) => seat.id === student.seat_id) || null,
    }));

    res.json({ students: studentsWithShiftsAndSeats });
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
