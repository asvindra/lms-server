import { createClient } from "@supabase/supabase-js";
// import "dotenv/config";
import dotenv from "dotenv";
import fs from "fs";
const env = process.env.NODE_ENV || "development";
const envFilePath = `.env.${
  env === "production" ? "prod" : env === "staging" ? "dev" : "local"
}`;

if (fs.existsSync(envFilePath)) {
  console.log(`Loading environment file: ${envFilePath}`);
  dotenv.config({ path: envFilePath });
} else {
  console.error(`Environment file not found: ${envFilePath}`);
  dotenv.config(); // Fallback to default .env
}
dotenv.config({ path: `.env.${env}` });

// Log environment variables for debugging
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log(
  "SUPABASE_SERVICE_KEY:",
  process.env.SUPABASE_SERVICE_KEY ? "Set" : "Not set"
);

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not set in environment variables.");
}
if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is not set in environment variables.");
}

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
