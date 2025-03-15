// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface TokenPayload {
  userId: string;
  email: string;
  role: "admin" | "student";
  isSubscribed?: boolean;
  hasPaid?: boolean;
  isMaster?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied, no token provided" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as TokenPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

export const requireSubscribedAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("req", req.user);

  if (!req.user || req.user.role !== "admin" || !req.user.isSubscribed) {
    console.log("inside", req.user?.isSubscribed);

    return res.status(403).json({ error: "Subscribed admin access required" });
  }
  next();
};

export const requirePaidStudent = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "student" || !req.user.hasPaid) {
    return res.status(403).json({ error: "Paid student access required" });
  }
  next();
};
