#!/usr/bin/env node

// Load environment variables FIRST
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import { sendLicenseKeyEmail } from "../services/email.service";

// License key data from recent creation
const licenseKeyData = {
  email: "20102082.chandan.yadav@gmail.com",
  licenseKey: "VMCQPLHR3",
  stallName: "Scan2Card",
  expiresAt: new Date("2026-02-10T18:29:59.999Z"),
  isExistingUser: true, // User already exists, so no password
};

const sendEmail = async () => {
  try {
    console.log("📧 Sending license key email...");
    console.log(`   To: ${licenseKeyData.email}`);
    console.log(`   License Key: ${licenseKeyData.licenseKey}`);
    console.log(`   Stall: ${licenseKeyData.stallName}`);
    console.log(`   Expires: ${licenseKeyData.expiresAt.toLocaleDateString()}`);
    console.log("");

    const result = await sendLicenseKeyEmail(licenseKeyData);

    if (result) {
      console.log("✅ Email sent successfully!");
    } else {
      console.log("❌ Failed to send email");
    }
  } catch (error: any) {
    console.error("❌ Error sending email:", error.message);
  }

  process.exit(0);
};

sendEmail();
