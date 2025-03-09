// backend/src/routes/authRoutes.ts
import express from "express";
import { signupAdmin, login, forgotPassword, verifyOtp } from "../controllers/authController";

const router = express.Router();

router.post("/signup", signupAdmin);           // Admin signup with email, password, and OTP
router.post("/login", login);                 // Password-based login for admin/student
router.post("/forgot-password", forgotPassword); // Password reset with OTP
router.post("/verify", verifyOtp);            // Single endpoint for both signup and forgot-password OTP verification

export default router;