import { Request, Response } from "express";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import formidable from "formidable";
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

export const getStudentSubscription = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, payment_done")
      .eq("id", user.userId)
      .single();

    if (studentError || !student) {
      return res.status(403).json({ error: "Student not found" });
    }

    res.json({ isSubscribed: student.payment_done });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

export const getStudentById = async (req: any, res: Response) => {
  try {
    const user = req.user;
    const studentId = req.user.userId;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch student
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select(
        "id, email, name, mobile_no, aadhar_no, address, father_name, joining_date, gender, payment_mode, payment_done, seat_id, admin_id, profile_photo"
      )
      .eq("id", studentId)
      .single();

    console.log("studentId: ", student, req.user);

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Fetch student shifts
    const { data: studentShifts, error: shiftsError } = await supabase
      .from("student_shifts")
      .select("student_id, shift_id, monthly_fee")
      .eq("student_id", studentId);

    if (shiftsError) {
      return res.status(500).json({ error: shiftsError.message });
    }

    // Fetch seat details
    const { data: seat, error: seatError } = await supabase
      .from("seats")
      .select("id, seat_number, reserved_by")
      .eq("id", student.seat_id)
      .single();

    if (seatError && seatError.code !== "PGRST116") {
      // Ignore "no rows" error
      return res.status(500).json({ error: seatError.message });
    }

    // Combine student data with shifts and seat
    const studentWithShiftsAndSeat = {
      ...student,
      shifts: studentShifts || [],
      seat: seat || null,
    };

    res.status(200).json({ student: studentWithShiftsAndSeat });
  } catch (err: any) {
    console.error("Error fetching student:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

export const updateStudentProfile = async (req: any, res: Response) => {
  console.log("Starting updateStudentProfile");
  console.log("Request headers:", req.headers);

  const contentType = req.headers["content-type"] || "";
  console.log("Content-Type:", contentType);

  if (contentType.includes("multipart/form-data")) {
    const form = formidable({ multiples: false }); // Single file upload
    console.log("Before form.parse");

    form.parse(req, async (err, fields, files) => {
      console.log("Inside form.parse callback");
      if (err) {
        console.error("Error parsing form:", err);
        return res.status(500).json({ error: "Failed to parse request" });
      }
      console.log("Raw fields:", fields);
      console.log("Raw files:", files);

      // Extract fields, handling potential arrays
      const name = Array.isArray(fields.name) ? fields.name[0] : fields.name;
      const mobileNo = Array.isArray(fields.mobileNo)
        ? fields.mobileNo[0]
        : fields.mobileNo;
      const address = Array.isArray(fields.address)
        ? fields.address[0]
        : fields.address;
      const fatherName = Array.isArray(fields.fatherName)
        ? fields.fatherName[0]
        : fields.fatherName;
      const gender = Array.isArray(fields.gender)
        ? fields.gender[0]
        : fields.gender;
      const email = Array.isArray(fields.email)
        ? fields.email[0]
        : fields.email;

      // Handle profilePhoto as potentially an array or single file
      const profilePhotoArray = files.profilePhoto;
      const profilePhoto = Array.isArray(profilePhotoArray)
        ? profilePhotoArray[0] // Take the first file if it’s an array
        : profilePhotoArray; // Use directly if it’s a single file

      console.log("Profile photo object:", profilePhoto);

      if (profilePhoto && !profilePhoto.filepath) {
        console.error("Filepath missing in profilePhoto:", profilePhoto);
        return res
          .status(400)
          .json({ error: "Invalid file upload: No filepath" });
      }

      try {
        const userId = req.user?.userId;
        if (!userId) {
          console.log("No userId found");
          return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("Fetching student for userId:", userId);
        const { data: student, error: studentError } = await supabase
          .from("students")
          .select(
            "id, name, mobile_no, address, father_name, gender, email, profile_photo"
          )
          .eq("id", userId)
          .single();

        if (studentError || !student) {
          console.error("Student fetch error:", studentError);
          return res.status(404).json({ error: "Student not found" });
        }

        // Validate required fields
        if (
          !name ||
          !mobileNo ||
          !address ||
          !fatherName ||
          !gender ||
          !email
        ) {
          console.log("Missing required fields:", {
            name,
            mobileNo,
            address,
            fatherName,
            gender,
            email,
          });
          return res
            .status(400)
            .json({ error: "All basic profile fields are required" });
        }

        let profilePhotoUrl = student.profile_photo || "";
        console.log("Existing profile photo:", profilePhotoUrl);

        if (profilePhoto) {
          console.log("Processing profile photo upload");
          const fileExt =
            profilePhoto.originalFilename?.split(".").pop() || "jpg";
          const fileName = `${uuidv4()}.${fileExt}`;
          const filePath = `student-profiles/${student.id}/${fileName}`;

          const fileLocation = profilePhoto.filepath;
          if (!fileLocation) {
            console.error(
              "No file location found in profilePhoto:",
              profilePhoto
            );
            return res
              .status(400)
              .json({ error: "File upload missing location" });
          }

          const fileBuffer = fs.readFileSync(fileLocation);
          const { error: uploadError } = await supabase.storage
            .from("profile-photos")
            .upload(filePath, fileBuffer, {
              contentType: profilePhoto.mimetype || "image/jpeg",
              cacheControl: "3600",
              upsert: true,
            });

          if (uploadError) {
            console.error("Upload error:", uploadError);
            return res.status(500).json({ error: "Failed to upload photo" });
          }

          // Generate a signed URL (valid for 1 hour)
          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
              .from("profile-photos")
              .createSignedUrl(filePath, 3600);

          if (signedUrlError) {
            console.error("Signed URL error:", signedUrlError);
            return res
              .status(500)
              .json({ error: "Failed to generate signed URL" });
          }

          profilePhotoUrl = signedUrlData.signedUrl;
          console.log("New signed profile photo URL:", profilePhotoUrl);
        }

        console.log("Updating student with:", {
          name,
          mobileNo,
          address,
          fatherName,
          gender,
          email,
          profilePhotoUrl,
        });
        const { data: updatedStudent, error: updateError } = await supabase
          .from("students")
          .update({
            name,
            mobile_no: mobileNo,
            address,
            father_name: fatherName,
            gender,
            email,
            profile_photo: profilePhotoUrl,
          })
          .eq("id", student.id)
          .select(
            "id, name, mobile_no, address, father_name, gender, email, profile_photo"
          )
          .single();

        if (updateError) {
          console.error("Update error:", updateError);
          return res.status(500).json({ error: updateError.message });
        }

        const responseStudent = {
          name: updatedStudent.name || "",
          mobile_no: updatedStudent.mobile_no || "",
          address: updatedStudent.address || "",
          father_name: updatedStudent.father_name || "",
          gender: updatedStudent.gender || "",
          email: updatedStudent.email || "",
          profile_photo: updatedStudent.profile_photo || "",
        };

        console.log("Update successful:", responseStudent);
        res.status(200).json({
          message: "Profile updated successfully",
          student: responseStudent,
        });
      } catch (error: any) {
        console.error("Error in updateStudentProfile:", error);
        res.status(500).json({ error: error.message || "Server error" });
      } finally {
        if (
          profilePhoto &&
          profilePhoto.filepath &&
          fs.existsSync(profilePhoto.filepath)
        ) {
          fs.unlinkSync(profilePhoto.filepath);
        }
      }
    });
  } else if (contentType.includes("application/json")) {
    console.log("Handling JSON request");
    const { name, mobileNo, address, fatherName, gender, email } = req.body;
    try {
      const userId = req.user?.userId;
      if (!userId) {
        console.log("No userId found");
        return res.status(401).json({ error: "Unauthorized" });
      }

      console.log("Fetching student for userId:", userId);
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select(
          "id, name, mobile_no, address, father_name, gender, email, profile_photo"
        )
        .eq("id", userId)
        .single();

      if (studentError || !student) {
        console.error("Student fetch error:", studentError);
        return res.status(404).json({ error: "Student not found" });
      }

      if (!name || !mobileNo || !address || !fatherName || !gender || !email) {
        console.log("Missing required fields:", {
          name,
          mobileNo,
          address,
          fatherName,
          gender,
          email,
        });
        return res
          .status(400)
          .json({ error: "All basic profile fields are required" });
      }

      console.log("Updating student with:", {
        name,
        mobileNo,
        address,
        fatherName,
        gender,
        email,
      });
      const { data: updatedStudent, error: updateError } = await supabase
        .from("students")
        .update({
          name,
          mobile_no: mobileNo,
          address,
          father_name: fatherName,
          gender,
          email,
          profile_photo: student.profile_photo || "",
        })
        .eq("id", student.id)
        .select(
          "id, name, mobile_no, address, father_name, gender, email, profile_photo"
        )
        .single();

      if (updateError) {
        console.error("Update error:", updateError);
        return res.status(500).json({ error: updateError.message });
      }

      const responseStudent = {
        name: updatedStudent.name || "",
        mobile_no: updatedStudent.mobile_no || "",
        address: updatedStudent.address || "",
        father_name: updatedStudent.father_name || "",
        gender: updatedStudent.gender || "",
        email: updatedStudent.email || "",
        profile_photo: updatedStudent.profile_photo || "",
      };

      console.log("Update successful:", responseStudent);
      res.status(200).json({
        message: "Profile updated successfully",
        student: responseStudent,
      });
    } catch (error: any) {
      console.error("Error in updateStudentProfile:", error);
      res.status(500).json({ error: error.message || "Server error" });
    }
  } else {
    console.log("Unsupported Content-Type");
    return res.status(415).json({ error: "Unsupported Media Type" });
  }
};
