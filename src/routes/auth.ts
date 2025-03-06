// src/routes/auth.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Sign up user with Supabase (pending confirmation)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw new Error(error.message);

    const user = data.user;
    if (!user) throw new Error('User creation failed');

    // Generate confirmation token
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET!, {
      expiresIn: '24h', // Token valid for 24 hours
    });

    // Send confirmation email
    const confirmationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?token=${token}`;
    await transporter.sendMail({
      from: `"Library Management" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Confirm Your Signup',
      html: `
        <h1>Welcome to Library Management System</h1>
        <p>Please confirm your email by clicking the link below:</p>
        <a href="${confirmationLink}">${confirmationLink}</a>
        <p>This link expires in 24 hours.</p>
      `,
    });

    res.status(201).json({ message: 'Signup successful. Please check your email to confirm.' });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user?.confirmed_at) throw new Error('Please confirm your email first.');

    const token = jwt.sign({ id: data.user.id, email }, process.env.JWT_SECRET!, {
      expiresIn: '1h',
    });

    res.json({ token });
  } catch (err: any) {
    res.status(401).json({ message: err.message });
  }
});

router.get('/confirm', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'Invalid token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { data, error } = await supabase.auth.admin.updateUserById(decoded.id, {
      email_confirm: true,
    });

    if (error) throw new Error(error.message);

    res.status(200).json({ message: 'Email confirmed successfully. You can now log in.' });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

export default router;