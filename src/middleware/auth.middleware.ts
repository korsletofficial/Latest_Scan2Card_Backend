import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { connectToMongooseDatabase } from "../config/db.config";
import UserModel from "../models/user.model";

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    _id: string;
    userId: string;
    email: string;
    role: string;
  };
  file?: Express.Multer.File;
  files?:
    | Express.Multer.File[]
    | { [fieldname: string]: Express.Multer.File[] };
}

// Verify JWT token middleware
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token is required",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "scan2card_secret"
    ) as any;

    // Check if user still exists and is active
    await connectToMongooseDatabase();
    const user = await UserModel.findById(decoded.userId);

    if (!user || user.isDeleted || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive user",
      });
    }

    // Attach user to request
    req.user = {
      _id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error: any) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

// Role-based authorization middleware
export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
};
