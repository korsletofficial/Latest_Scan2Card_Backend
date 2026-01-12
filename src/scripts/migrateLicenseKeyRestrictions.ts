import mongoose from "mongoose";
import { connectToMongooseDatabase } from "../config/db.config";
import UserModel from "../models/user.model";
import EventModel from "../models/event.model";
import RoleModel from "../models/role.model";

/**
 * Migration script to add license key restriction fields to existing exhibitors
 *
 * This script:
 * 1. Sets default maxLicenseKeys (20) and maxTotalActivations (100) for all exhibitors
 * 2. Calculates currentLicenseKeyCount based on existing license keys
 * 3. Calculates currentTotalActivations based on existing maxActivations
 */

async function migrateLicenseKeyRestrictions() {
  try {
    console.log("🚀 Starting license key restrictions migration...");

    await connectToMongooseDatabase();

    // Find EXHIBITOR role
    const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });

    if (!exhibitorRole) {
      console.error("❌ EXHIBITOR role not found");
      process.exit(1);
    }

    console.log(`✅ Found EXHIBITOR role: ${exhibitorRole._id}`);

    // Find all exhibitors
    const exhibitors = await UserModel.find({
      role: exhibitorRole._id,
      isDeleted: false,
    });

    console.log(`📊 Found ${exhibitors.length} exhibitors to migrate`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const exhibitor of exhibitors) {
      try {
        // Find all events for this exhibitor
        const events = await EventModel.find({
          exhibitorId: exhibitor._id,
          isDeleted: false,
        });

        // Calculate current license key count and total activations
        let currentLicenseKeyCount = 0;
        let currentTotalActivations = 0;

        for (const event of events) {
          if (event.licenseKeys && Array.isArray(event.licenseKeys)) {
            currentLicenseKeyCount += event.licenseKeys.length;

            for (const key of event.licenseKeys) {
              currentTotalActivations += key.maxActivations || 1;
            }
          }
        }

        // Update exhibitor with default restrictions and calculated current usage
        const updateResult = await UserModel.updateOne(
          { _id: exhibitor._id },
          {
            $set: {
              maxLicenseKeys: exhibitor.maxLicenseKeys !== undefined ? exhibitor.maxLicenseKeys : 20,
              maxTotalActivations: exhibitor.maxTotalActivations !== undefined ? exhibitor.maxTotalActivations : 100,
              currentLicenseKeyCount,
              currentTotalActivations,
            },
          }
        );

        if (updateResult.modifiedCount > 0) {
          updatedCount++;
          console.log(
            `✅ Updated exhibitor ${exhibitor.email || exhibitor.phoneNumber} ` +
            `(Keys: ${currentLicenseKeyCount}, Activations: ${currentTotalActivations})`
          );
        } else {
          skippedCount++;
          console.log(
            `⏭️  Skipped exhibitor ${exhibitor.email || exhibitor.phoneNumber} (already migrated or no changes)`
          );
        }
      } catch (error: any) {
        errorCount++;
        console.error(
          `❌ Error processing exhibitor ${exhibitor.email || exhibitor.phoneNumber}:`,
          error.message
        );
      }
    }

    console.log("\n📈 Migration Summary:");
    console.log(`   ✅ Successfully updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped (no changes): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total exhibitors: ${exhibitors.length}`);

    console.log("\n✅ Migration completed successfully!");

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
migrateLicenseKeyRestrictions();
