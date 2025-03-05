// src/index.ts
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import healthRoutes from './routes/health'; // Ensure this matches the file path

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.NEXT_PUBLIC_APP_URL }));

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

app.use('/api', healthRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});