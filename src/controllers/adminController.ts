import { Request, Response } from "express";
import formidable from "formidable";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../config/db";
import Razorpay from "razorpay";

const razorpay: any = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Interface for formidable file (improves type safety)
interface FormidableFile {
  filepath: string;
  originalFilename?: string;
  mimetype?: string;
}

// GET /api/admin/profile
export const getAdminProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch admin profile
    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select(
        "id, name, business_name, email, profile_photo, mobile_no, vpa, is_verified"
      )
      .eq("id", userId)
      .single();

    if (adminError || !admin) {
      console.error("Admin fetch error:", adminError);
      return res.status(404).json({ error: "Admin not found" });
    }

    if (!admin.is_verified) {
      return res.status(403).json({ error: "Admin must be verified" });
    }

    // Fetch subscription status
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    res.status(200).json({
      admin: {
        id: admin.id,
        name: admin.name,
        business_name: admin.business_name,
        email: admin.email,
        mobile_no: admin.mobile_no,
        profile_photo: admin.profile_photo,
        vpa: admin.vpa,
        is_verified: admin.is_verified,
        subscription_status: subscription?.status || "inactive",
      },
    });
  } catch (err: any) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// POST /api/admin/profile
export const updateAdminProfile = async (req: Request, res: Response) => {
  console.log("Starting updateAdminProfile");
  console.log("Request headers:", req.headers);

  const contentType = req.headers["content-type"] || "";
  console.log("Content-Type:", contentType);

  if (contentType.includes("multipart/form-data")) {
    const form = formidable({ multiples: false });
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
      const bankName = Array.isArray(fields.bankName)
        ? fields.bankName[0]
        : fields.bankName;
      const accountNumber = Array.isArray(fields.accountNumber)
        ? fields.accountNumber[0]
        : fields.accountNumber;
      const ifscCode = Array.isArray(fields.ifscCode)
        ? fields.ifscCode[0]
        : fields.ifscCode;

      const profilePhotoArray = files.profilePhoto;
      const profilePhoto: FormidableFile | any = Array.isArray(
        profilePhotoArray
      )
        ? profilePhotoArray[0]
        : profilePhotoArray;

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
        bankName,
        accountNumber,
        ifscCode,
        profilePhoto
      );
    });
  } else if (contentType.includes("application/json")) {
    console.log("Handling JSON request");
    const { name, businessName, mobileNo, bankName, accountNumber, ifscCode } =
      req.body;
    await processProfileUpdate(
      req,
      res,
      name,
      businessName,
      mobileNo,
      bankName,
      accountNumber,
      ifscCode,
      undefined
    );
  } else {
    console.log("Unsupported Content-Type");
    return res.status(415).json({ error: "Unsupported Media Type" });
  }
};

const processProfileUpdate = async (
  req: Request,
  res: Response,
  name: string | undefined,
  businessName: string | undefined,
  mobileNo: string | undefined,
  bankName: string | undefined,
  accountNumber: string | undefined,
  ifscCode: string | undefined,
  profilePhoto: FormidableFile | undefined
) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      console.log("No userId found");
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("Fetching admin for userId:", userId);
    const { data: admin, error: adminError } = await supabase
      .from("admin")
      .select(
        "id, is_verified, profile_photo, name, business_name, mobile_no, email, vpa"
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

      const fileBuffer = fs.readFileSync(profilePhoto.filepath);
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

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("profile-photos")
          .createSignedUrl(filePath, 3600);

      if (signedUrlError) {
        console.error("Signed URL error:", signedUrlError);
        return res.status(500).json({ error: "Failed to generate signed URL" });
      }

      profilePhotoUrl = signedUrlData.signedUrl;
      console.log("New signed profile photo URL:", profilePhotoUrl);
    }

    let vpa = admin.vpa || "";
    if (bankName && accountNumber && ifscCode) {
      console.log("Setting up bank account and VPA");
      // Create Razorpay contact
      const contact = await razorpay.contact.create({
        name: name || admin.name || "Admin",
        email: admin.email,
        contact: mobileNo || admin.mobile_no || "1234567890",
        type: "customer",
      });

      // Create Razorpay fund account
      const fundAccount = await razorpay.fund_account.create({
        contact_id: contact.id,
        account_type: "bank_account",
        bank_account: {
          name: name || admin.name || "Admin",
          account_number: accountNumber,
          ifsc: ifscCode,
        },
      });

      // Mock VPA (use PSP API in production)
      vpa = `${(name || admin.name || "admin")
        .toLowerCase()
        .replace(/\s/g, "")}@razorpay`;

      // Save bank account details
      const { error: bankError } = await supabase.from("bank_accounts").insert({
        user_id: userId,
        bank_name: bankName,
        account_number: accountNumber,
        ifsc_code: ifscCode,
        vpa,
        verified: true,
      });

      if (bankError) {
        console.error("Bank account insert error:", bankError);
        return res.status(500).json({ error: "Failed to save bank details" });
      }
    }

    console.log("Updating admin with:", {
      name,
      businessName,
      mobileNo,
      profilePhotoUrl,
      vpa,
    });
    const { data: updatedAdmin, error: updateError } = await supabase
      .from("admin")
      .update({
        name: name !== undefined ? name : admin.name || "",
        business_name:
          businessName !== undefined ? businessName : admin.business_name || "",
        mobile_no: mobileNo !== undefined ? mobileNo : admin.mobile_no || "",
        profile_photo: profilePhotoUrl,
        vpa,
      })
      .eq("id", admin.id)
      .select("id, name, business_name, mobile_no, email, profile_photo, vpa")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    const responseAdmin = {
      id: updatedAdmin.id,
      name: updatedAdmin.name || "",
      business_name: updatedAdmin.business_name || "",
      mobile_no: updatedAdmin.mobile_no || "",
      email: updatedAdmin.email || "",
      profile_photo: updatedAdmin.profile_photo || "",
      vpa: updatedAdmin.vpa || "",
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
