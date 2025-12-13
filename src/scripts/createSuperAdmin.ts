#!/usr/bin/env node

// Load environment variables FIRST
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import bcrypt from "bcrypt";
import { connectToMongooseDatabase } from "../config/db.config";
import RoleModel from "../models/role.model";
import UserModel from "../models/user.model";

// Seed default roles first
const seedRoles = async () => {
  console.log("🌱 Seeding roles...");

  const defaultRoles = [
    { name: "SUPERADMIN", description: "Creates and manages exhibitors. Oversees overall system activity." },
    { name: "EXHIBITOR", description: "Creates events, generates license keys, and manages team access." },
    { name: "TEAMMANAGER", description: "Manages team members participating in the event." },
    { name: "ENDUSER", description: "Scans attendee cards using OCR and saves lead data." },
  ];

  for (const role of defaultRoles) {
    const exists = await RoleModel.findOne({ name: role.name });
    if (!exists) {
      await RoleModel.create(role);
      console.log(`✅ Role created: ${role.name}`);
    } else {
      console.log(`ℹ️  Role already exists: ${role.name}`);
    }
  }

  console.log("✅ Roles seeding completed\n");
};

// Create SuperAdmin user
const createSuperAdmin = async () => {
  try {
    // Connect to database
    console.log("🔌 Connecting to database...");
    await connectToMongooseDatabase();

    // Seed roles first
    await seedRoles();

    // Get SUPERADMIN role
    const superAdminRole = await RoleModel.findOne({ name: "SUPERADMIN" });

    if (!superAdminRole) {
      console.error("❌ SUPERADMIN role not found. Please seed roles first.");
      process.exit(1);
    }

    // SuperAdmin credentials (CHANGE THESE!)
    const superAdminData = {
      firstName: "Super",
      lastName: "Admin",
      email: "admin@scan2card.com", // CHANGE THIS
      password: "Admin@123", // CHANGE THIS
      role: superAdminRole._id,
      isVerified: true,
      isActive: true,
      twoFactorEnabled: false,
    };

    // Check if superadmin already exists
    const existingAdmin = await UserModel.findOne({
      email: superAdminData.email
    });

    if (existingAdmin) {
      console.log(`⚠️  SuperAdmin already exists with email: ${superAdminData.email}`);
      console.log("User ID:", existingAdmin._id);
      process.exit(0);
    }

    // Hash password
    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(superAdminData.password, 10);

    // Create superadmin
    console.log("👤 Creating SuperAdmin user...");
    const newSuperAdmin = await UserModel.create({
      ...superAdminData,
      password: hashedPassword,
    });

    console.log("\n✅ SuperAdmin created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 Email:", superAdminData.email);
    console.log("🔑 Password:", superAdminData.password);
    console.log("🆔 User ID:", newSuperAdmin._id);
    console.log("👤 Role:", superAdminRole.name);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n⚠️  IMPORTANT: Please change the default password after first login!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating SuperAdmin:", error);
    process.exit(1);
  }
};

// Run the script
createSuperAdmin();
