import { Response } from "express";

import formidable from "formidable";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../config/db";

export const getAdminProfile = async (req: any, res: any) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error } = await supabase
      .from("admin")
      .select("id, name, business_name, email, profile_photo, mobile_no")
      .eq("id", userId)
      .single();

    if (error || !admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.status(200).json({ admin });
  } catch (err: any) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

export const updateAdminProfile = async (req: any, res: Response) => {
  console.log("Starting updateAdminProfile");
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

      const name = Array.isArray(fields.name) ? fields.name[0] : fields.name;
      const businessName = Array.isArray(fields.businessName)
        ? fields.businessName[0]
        : fields.businessName;
      const mobileNo = Array.isArray(fields.mobileNo)
        ? fields.mobileNo[0]
        : fields.mobileNo;

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

      await processProfileUpdate(
        req,
        res,
        name,
        businessName,
        mobileNo,
        profilePhoto
      );
    });
  } else if (contentType.includes("application/json")) {
    console.log("Handling JSON request");
    const { name, businessName, mobileNo } = req.body;
    await processProfileUpdate(
      req,
      res,
      name,
      businessName,
      mobileNo,
      undefined
    );
  } else {
    console.log("Unsupported Content-Type");
    return res.status(415).json({ error: "Unsupported Media Type" });
  }
};

const processProfileUpdate = async (
  req: any,
  res: Response,
  name: string | undefined,
  businessName: string | undefined,
  mobileNo: string | undefined,
  profilePhoto: formidable.File | undefined
) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      console.log("No userId found");
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("Fetching admin for userId:", userId);
    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select(
        "id, is_verified, profile_photo, name, business_name, mobile_no, email"
      )
      .eq("id", userId)
      .single();

    if (adminError || !admin) {
      console.error("Admin fetch error:", adminError);
      return res.status(404).json({ error: "Admin not found" });
    }

    if (!admin.is_verified) {
      console.log("Admin not verified");
      return res.status(403).json({ error: "Admin must be verified" });
    }

    let profilePhotoUrl = admin.profile_photo || "";
    console.log("Existing profile photo:", profilePhotoUrl);

    if (profilePhoto) {
      console.log("Processing profile photo upload");
      const fileExt = profilePhoto.originalFilename?.split(".").pop() || "jpg";
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `admin-profiles/${admin.id}/${fileName}`;

      const fileLocation = profilePhoto.filepath;
      if (!fileLocation) {
        console.error("No file location found in profilePhoto:", profilePhoto);
        return res.status(400).json({ error: "File upload missing location" });
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

      // Generate a signed URL (valid for 1 hour, adjust as needed)
      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("profile-photos")
          .createSignedUrl(filePath, 3600); // 3600 seconds = 1 hour

      if (signedUrlError) {
        console.error("Signed URL error:", signedUrlError);
        return res.status(500).json({ error: "Failed to generate signed URL" });
      }

      profilePhotoUrl = signedUrlData.signedUrl;
      console.log("New signed profile photo URL:", profilePhotoUrl);
    }

    console.log("Updating admin with:", {
      name,
      businessName,
      mobileNo,
      profilePhotoUrl,
    });
    const { data: updatedAdmin, error: updateError } = await supabase
      .from("admin")
      .update({
        name: name !== undefined ? name : admin.name || "",
        business_name:
          businessName !== undefined ? businessName : admin.business_name || "",
        mobile_no: mobileNo !== undefined ? mobileNo : admin.mobile_no || "",
        profile_photo: profilePhotoUrl,
      })
      .eq("id", admin.id)
      .select("id, name, business_name, mobile_no, email, profile_photo")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    const responseAdmin = {
      name: updatedAdmin.name || "",
      business_name: updatedAdmin.business_name || "",
      mobile_no: updatedAdmin.mobile_no || "",
      email: updatedAdmin.email || "",
      profile_photo: updatedAdmin.profile_photo || "",
    };

    console.log("Update successful:", responseAdmin);
    res.status(200).json({
      message: "Profile updated successfully",
      admin: responseAdmin,
    });
  } catch (error: any) {
    console.error("Error in processProfileUpdate:", error);
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
};
