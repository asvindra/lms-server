import { Request, Response } from "express";
import { supabase } from "../config/db";

export const allocateSeat = async (req: any, res: Response) => {
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

    const { seatId, studentId } = req.body;

    if (!seatId || !studentId) {
      return res
        .status(400)
        .json({ error: "Seat ID and Student ID are required" });
    }

    // Check student exists
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, seat_id")
      .eq("id", studentId)
      .eq("admin_id", admin.id)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check seat availability
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

    // Deallocate existing seat if any
    if (student.seat_id) {
      const { error: deallocateError } = await supabase
        .from("seats")
        .update({ reserved_by: null })
        .eq("id", student.seat_id);
      if (deallocateError) {
        return res.status(500).json({ error: deallocateError.message });
      }
    }

    // Update both tables atomically
    const { error: studentUpdateError } = await supabase
      .from("students")
      .update({ seat_id: seatId, updated_at: new Date().toISOString() })
      .eq("id", studentId);

    if (studentUpdateError) {
      return res.status(500).json({ error: studentUpdateError.message });
    }

    const { error: seatUpdateError } = await supabase
      .from("seats")
      .update({ reserved_by: studentId })
      .eq("id", seatId);

    if (seatUpdateError) {
      // Rollback student update if seat update fails
      await supabase
        .from("students")
        .update({ seat_id: null, updated_at: new Date().toISOString() })
        .eq("id", studentId);
      return res.status(500).json({ error: seatUpdateError.message });
    }

    res.json({ message: "Seat allocated successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const deallocateSeat = async (req: any, res: Response) => {
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

    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: "Student ID is required" });
    }

    // Check student exists and has a seat
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, seat_id")
      .eq("id", studentId)
      .eq("admin_id", admin.id)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    if (!student.seat_id) {
      return res.status(400).json({ error: "Student has no seat allocated" });
    }

    // Update both tables
    const { error: seatUpdateError } = await supabase
      .from("seats")
      .update({ reserved_by: null })
      .eq("id", student.seat_id);

    if (seatUpdateError) {
      return res.status(500).json({ error: seatUpdateError.message });
    }

    const { error: studentUpdateError } = await supabase
      .from("students")
      .update({ seat_id: null, updated_at: new Date().toISOString() })
      .eq("id", studentId);

    if (studentUpdateError) {
      // Rollback seat update if student update fails
      await supabase
        .from("seats")
        .update({ reserved_by: studentId })
        .eq("id", student.seat_id);
      return res.status(500).json({ error: studentUpdateError.message });
    }

    res.json({ message: "Seat deallocated successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const getAvailableSeats = async (req: any, res: Response) => {
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

    const studentId = req.query?.studentId as string; // Optional studentId from query

    // Fetch all seats
    const { data: seats, error: seatsError } = await supabase
      .from("seats")
      .select("id, seat_number, reserved_by")
      .eq("admin_id", admin.id)
      .order("seat_number", { ascending: true });

    if (seatsError) {
      return res.status(500).json({ error: seatsError.message });
    }

    // Include available seats + the student's current seat if editing
    const filteredSeats = studentId
      ? seats // In edit mode, return all seats (available + student's current seat)
      : seats.filter((seat) => !seat.reserved_by); // In add mode, only available seats

    res.json({ seats: filteredSeats });
  } catch (err: any) {
    console.error("Error in getAvailableSeats:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
