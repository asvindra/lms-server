// src/index.ts
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';



const supabaseUrl =  process.env.SUPABASE_URL;
const supabaseKey =  process.env.SUPABASE_ANON_KEY;

console.log('supabaseUrl:', supabaseUrl); // Debug
console.log('supabaseKey:', supabaseKey); // Debug

if (!supabaseUrl) throw new Error('supabaseUrl is required.');
if (!supabaseKey) throw new Error('supabaseKey is required.');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.NEXT_PUBLIC_APP_URL }));

const supabase = createClient(supabaseUrl, supabaseKey);

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});