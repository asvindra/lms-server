// backend/src/config/email.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER, // Use environment variables for security
    pass: process.env.EMAIL_PASS, // App Password here
  },
});

export const sendOtpEmail = async (email: string, otp: number) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP for Library Management System",
    text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
  };

  await transporter.sendMail(mailOptions);
};
