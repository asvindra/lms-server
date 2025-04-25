import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/db";

export const requireMasterAdmin = async (
  req: any,
  res: Response,
  next: any
) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { data: admin, error } = await supabase
    .from("admin")
    .select("is_master, is_subscribed, is_verified")
    .eq("id", user.userId)
    .single();
  if (
    error ||
    !admin ||
    !admin.is_master ||
    !admin.is_subscribed ||
    !admin.is_verified
  ) {
    return res.status(403).json({ error: "Master admin access required" });
  }
  req.admin = admin;
  next();
};
