import { Request, Response } from "express";
import { supabase } from "../config/db";
import { generateShifts } from "../utils/config";

export const configureShifts = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    const { numShifts, hoursPerShift, startTime, fees, discounts } = req.body;

    if (
      !numShifts ||
      !hoursPerShift ||
      !startTime ||
      !fees ||
      fees.length !== numShifts
    ) {
      return res
        .status(400)
        .json({ error: "Missing or invalid shift configuration" });
    }

    if (discounts) {
      if (
        numShifts < 2 &&
        (discounts.discountSingle ||
          discounts.discountDouble ||
          discounts.discountTriple)
      ) {
        return res.status(400).json({
          error: "Discount for selections requires at least 2 shifts",
        });
      }
      if (
        numShifts < 3 &&
        (discounts.discountDouble || discounts.discountTriple)
      ) {
        return res.status(400).json({
          error: "Discount for double/triple requires at least 3 shifts",
        });
      }
      if (numShifts < 4 && discounts.discountTriple) {
        return res
          .status(400)
          .json({ error: "Discount for triple requires 4 shifts" });
      }
    }

    const generatedShifts = generateShifts(numShifts, hoursPerShift, startTime);

    const { data: existingStudents, error: studentsError } = await supabase
      .from("student_shifts")
      .select("shift_id")
      .in(
        "shift_id",
        (
          await supabase.from("shifts").select("id").eq("admin_id", admin.id)
        ).data?.map((s) => s.id) || []
      );

    if (studentsError)
      return res.status(500).json({ error: studentsError.message });
    if (existingStudents.length > 0) {
      return res
        .status(403)
        .json({ error: "Cannot edit shifts with assigned students" });
    }

    const { error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .eq("admin_id", admin.id);
    if (deleteError)
      return res.status(500).json({ error: deleteError.message });

    const shiftsToInsert = generatedShifts.map((shift, index) => ({
      admin_id: admin.id,
      shift_number: shift.shift_number,
      start_time: shift.start_time,
      end_time: shift.end_time,
      fees: fees[index],
    }));

    const { data: insertedShifts, error: insertError } = await supabase
      .from("shifts")
      .insert(shiftsToInsert)
      .select();

    if (insertError)
      return res.status(500).json({ error: insertError.message });

    if (discounts) {
      const discountConfigs = [];
      if (discounts.discountAllShifts !== undefined) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: numShifts, // All shifts discount
          discount_percentage: discounts.discountAllShifts,
        });
      }
      if (discounts.discountSingle !== undefined && numShifts >= 2) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: 1,
          discount_percentage: discounts.discountSingle,
        });
      }
      if (discounts.discountDouble !== undefined && numShifts >= 3) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: 2,
          discount_percentage: discounts.discountDouble,
        });
      }
      if (discounts.discountTriple !== undefined && numShifts === 4) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: 3,
          discount_percentage: discounts.discountTriple,
        });
      }

      if (discountConfigs.length > 0) {
        const { error: discountError } = await supabase
          .from("shift_discounts")
          .insert(discountConfigs);
        if (discountError)
          return res.status(500).json({ error: discountError.message });
      }
    }

    res.json({
      message: "Shifts configured successfully",
      shifts: insertedShifts,
    });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// Original getConfiguredShifts (without discount field)
export const getConfiguredShifts = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("shift_number, start_time, end_time, fees, id")
      .eq("admin_id", admin.id)
      .order("shift_number", { ascending: true });

    if (shiftsError)
      return res.status(500).json({ error: shiftsError.message });
    if (!shifts || shifts.length === 0) {
      return res
        .status(200)
        .json({ shifts: [], discounts: [], message: "No shifts configured" });
    }

    const { data: discounts, error: discountsError } = await supabase
      .from("shift_discounts")
      .select("min_shifts, discount_percentage")
      .eq("admin_id", admin.id)
      .order("min_shifts", { ascending: true });

    if (discountsError)
      return res.status(500).json({ error: discountsError.message });

    res.json({
      shifts,
      discounts: discounts || [],
    });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// New endpoint: Update Shifts
export const updateShifts = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    const { shiftNumber, startTime, endTime, fees, discounts } = req.body;

    if (!shiftNumber || !startTime || !endTime || fees === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data: shift, error: shiftError } = await supabase
      .from("shifts")
      .select("id")
      .eq("admin_id", admin.id)
      .eq("shift_number", shiftNumber)
      .single();

    if (shiftError || !shift) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const { data: existingStudents, error: studentsError } = await supabase
      .from("student_shifts")
      .select("shift_id")
      .eq("shift_id", shift.id);

    if (studentsError)
      return res.status(500).json({ error: studentsError.message });
    if (existingStudents.length > 0) {
      return res
        .status(403)
        .json({ error: "Cannot update shift with assigned students" });
    }

    const { error: updateError } = await supabase
      .from("shifts")
      .update({
        start_time: startTime,
        end_time: endTime,
        fees,
      })
      .eq("admin_id", admin.id)
      .eq("shift_number", shiftNumber);

    if (updateError)
      return res.status(500).json({ error: updateError.message });

    if (discounts) {
      const numShifts =
        (await supabase.from("shifts").select("id").eq("admin_id", admin.id))
          .data?.length || 0;

      if (
        numShifts < 2 &&
        (discounts.discountSingle ||
          discounts.discountDouble ||
          discounts.discountTriple)
      ) {
        return res.status(400).json({
          error: "Discount for selections requires at least 2 shifts",
        });
      }
      if (
        numShifts < 3 &&
        (discounts.discountDouble || discounts.discountTriple)
      ) {
        return res.status(400).json({
          error: "Discount for double/triple requires at least 3 shifts",
        });
      }
      if (numShifts < 4 && discounts.discountTriple) {
        return res
          .status(400)
          .json({ error: "Discount for triple requires 4 shifts" });
      }

      const discountConfigs = [];
      if (discounts.discountAllShifts !== undefined) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: numShifts,
          discount_percentage: discounts.discountAllShifts,
        });
      }
      if (discounts.discountSingle !== undefined && numShifts >= 2) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: 1,
          discount_percentage: discounts.discountSingle,
        });
      }
      if (discounts.discountDouble !== undefined && numShifts >= 3) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: 2,
          discount_percentage: discounts.discountDouble,
        });
      }
      if (discounts.discountTriple !== undefined && numShifts === 4) {
        discountConfigs.push({
          admin_id: admin.id,
          min_shifts: 3,
          discount_percentage: discounts.discountTriple,
        });
      }

      if (discountConfigs.length > 0) {
        const { error: deleteDiscountError } = await supabase
          .from("shift_discounts")
          .delete()
          .eq("admin_id", admin.id);
        if (deleteDiscountError)
          return res.status(500).json({ error: deleteDiscountError.message });

        const { error: insertDiscountError } = await supabase
          .from("shift_discounts")
          .insert(discountConfigs);
        if (insertDiscountError)
          return res.status(500).json({ error: insertDiscountError.message });
      }
    }

    res.json({ message: "Shift updated successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// New endpoint: Delete Shifts
export const deleteShifts = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    // Check if shifts exist
    const { data: existingShifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id")
      .eq("admin_id", admin.id);

    if (shiftsError)
      return res.status(500).json({ error: shiftsError.message });
    if (!existingShifts || existingShifts.length === 0) {
      return res.status(404).json({ error: "No shifts found to delete" });
    }

    // Check if students are assigned
    const { data: existingStudents, error: studentsError } = await supabase
      .from("student_shifts")
      .select("shift_id")
      .in(
        "shift_id",
        existingShifts.map((s) => s.id)
      );

    if (studentsError)
      return res.status(500).json({ error: studentsError.message });
    if (existingStudents.length > 0) {
      return res
        .status(403)
        .json({ error: "Cannot delete shifts with assigned students" });
    }

    // Delete shifts
    const { error: deleteShiftsError } = await supabase
      .from("shifts")
      .delete()
      .eq("admin_id", admin.id);
    if (deleteShiftsError)
      return res.status(500).json({ error: deleteShiftsError.message });

    // Delete associated discounts
    const { error: deleteDiscountsError } = await supabase
      .from("shift_discounts")
      .delete()
      .eq("admin_id", admin.id);
    if (deleteDiscountsError)
      return res.status(500).json({ error: deleteDiscountsError.message });

    res.json({ message: "Shifts deleted successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// New endpoint: Delete a single shift by shift_number
export const deleteShiftById = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { shiftNumber } = req.params; // Expect shift_number as a URL parameter

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    // Fetch the specific shift
    const { data: shift, error: shiftError } = await supabase
      .from("shifts")
      .select("id")
      .eq("admin_id", admin.id)
      .eq("shift_number", parseInt(shiftNumber))
      .single();

    if (shiftError || !shift) {
      return res.status(404).json({ error: "Shift not found" });
    }

    // Check if students are assigned to this shift
    const { data: existingStudents, error: studentsError } = await supabase
      .from("student_shifts")
      .select("shift_id")
      .eq("shift_id", shift.id);

    if (studentsError)
      return res.status(500).json({ error: studentsError.message });
    if (existingStudents.length > 0) {
      return res
        .status(403)
        .json({ error: "Cannot delete shift with assigned students" });
    }

    // Delete the shift
    const { error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .eq("id", shift.id);

    if (deleteError)
      return res.status(500).json({ error: deleteError.message });

    res.json({ message: `Shift ${shiftNumber} deleted successfully` });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// Configure seats (initial setup)
export const configureSeats = async (req: any, res: Response) => {
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

    const { numSeats } = req.body;
    if (!numSeats || numSeats < 1 || numSeats > 100) {
      return res
        .status(400)
        .json({ error: "Number of seats must be between 1 and 100" });
    }

    // Fetch existing seats to determine the next seat_number
    const { data: existingSeats, error: seatsError } = await supabase
      .from("seats")
      .select("seat_number")
      .eq("admin_id", admin.id)
      .order("seat_number", { ascending: true });

    if (seatsError) {
      return res.status(500).json({ error: seatsError.message });
    }

    const lastSeatNumber =
      existingSeats.length > 0
        ? existingSeats[existingSeats.length - 1].seat_number
        : 0;

    // Generate new seats starting from the next number
    const newSeats = Array.from({ length: numSeats }, (_, i) => ({
      seat_number: lastSeatNumber + i + 1,
      admin_id: admin.id,
    }));

    const { data, error } = await supabase
      .from("seats")
      .insert(newSeats)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Seats added successfully", seats: data });
  } catch (err: any) {
    console.error("Error in configureSeats:", err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// Fetch seat configuration
export const getSeatConfig = async (req: any, res: Response) => {
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

    // Fetch seats (no shift_id)
    const { data: seats, error: seatsError } = await supabase
      .from("seats")
      .select("id, seat_number, reserved_by")
      .eq("admin_id", admin.id)
      .order("seat_number", { ascending: true });

    if (seatsError) {
      console.error("Seats fetch error:", seatsError);
      return res.status(500).json({ error: seatsError.message });
    }

    // Enrich seat data with student shift info
    const seatData = await Promise.all(
      seats.map(async (seat) => {
        let studentShiftNumbers = [];

        // Fetch student's shift numbers (if reserved_by exists)
        if (seat.reserved_by) {
          const { data: studentShifts, error: studentShiftsError } =
            await supabase
              .from("student_shifts")
              .select("shift_id")
              .eq("student_id", seat.reserved_by);

          if (studentShiftsError) {
            console.error(
              `Student shifts fetch error for student ${seat.reserved_by}:`,
              studentShiftsError
            );
            throw studentShiftsError;
          }

          if (studentShifts && studentShifts.length > 0) {
            const shiftIds = studentShifts.map((ss) => ss.shift_id);
            const { data: shifts, error: shiftsError } = await supabase
              .from("shifts")
              .select("id, shift_number")
              .in("id", shiftIds);

            if (shiftsError) {
              console.error("Shifts fetch error:", shiftsError);
              throw shiftsError;
            }

            studentShiftNumbers = shifts.map((shift) => shift.shift_number);
          }
        }

        return {
          ...seat,
          student_shift_numbers: studentShiftNumbers, // Only student's shift numbers
        };
      })
    );

    res.json({ seats: seatData });
  } catch (err: any) {
    console.error("Error in getSeatConfig:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// Update seat (remove reservation)
export const updateSeatConfig = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { seatId } = req.body;

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    const { data: seat, error: seatError } = await supabase
      .from("seats")
      .select("id, admin_id, reserved_by")
      .eq("id", seatId)
      .eq("admin_id", admin.id)
      .single();

    if (seatError || !seat) {
      return res.status(404).json({ error: "Seat not found" });
    }

    if (!seat.reserved_by) {
      return res.status(400).json({ error: "Seat is not reserved" });
    }

    const { error: updateError } = await supabase
      .from("seats")
      .update({ reserved_by: null, shift_id: null })
      .eq("id", seatId);

    if (updateError)
      return res.status(500).json({ error: updateError.message });

    res.json({ message: "Seat reservation removed successfully" });
  } catch (err: any) {
    console.error("Error in updateSeatConfig:", err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

// Delete seat
export const deleteSeat = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { seatId } = req.params; //

    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select("*")
      .eq("id", user?.userId)
      .single();

    if (adminError || !admin || !admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    const { data: seat, error: seatError } = await supabase
      .from("seats")
      .select("id, admin_id, reserved_by")
      .eq("id", seatId)
      .eq("admin_id", admin.id)
      .single();

    if (seatError || !seat) {
      return res.status(404).json({ error: "Seat not found" });
    }

    if (seat.reserved_by) {
      return res.status(403).json({ error: "Cannot delete a reserved seat" });
    }

    const { error: deleteError } = await supabase
      .from("seats")
      .delete()
      .eq("id", seatId);

    if (deleteError)
      return res.status(500).json({ error: deleteError.message });

    res.json({ message: "Seat deleted successfully" });
  } catch (err: any) {
    console.error("Error in deleteSeat:", err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};
