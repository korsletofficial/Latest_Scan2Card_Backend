import dotenv from "dotenv";
dotenv.config();

import { connectToMongooseDatabase } from "../config/db.config";
import UserModel from "../models/user.model";
import EventModel from "../models/event.model";
import RoleModel from "../models/role.model";

/**
 * Script to recalculate and sync currentLicenseKeyCount & currentTotalActivations
 * for all exhibitors based on actual data in the events collection.
 *
 * This fixes drift where the stored counter on the user document
 * doesn't match the actual number of license keys across events.
 *
 * Usage: npx ts-node src/scripts/syncLicenseKeyCounts.ts
 */

async function syncLicenseKeyCounts() {
  try {
    console.log("Starting license key count sync...\n");

    await connectToMongooseDatabase();

    const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });

    if (!exhibitorRole) {
      console.error("EXHIBITOR role not found");
      process.exit(1);
    }

    const exhibitors = await UserModel.find({
      role: exhibitorRole._id,
      isDeleted: false,
    });

    console.log(`Found ${exhibitors.length} exhibitors to check\n`);

    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let errorCount = 0;

    for (const exhibitor of exhibitors) {
      try {
        // Aggregate actual counts from events
        const result = await EventModel.aggregate([
          {
            $match: {
              exhibitorId: exhibitor._id,
              isDeleted: false,
            },
          },
          { $unwind: { path: "$licenseKeys", preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: null,
              totalKeys: { $sum: 1 },
              totalActivations: { $sum: { $ifNull: ["$licenseKeys.maxActivations", 1] } },
            },
          },
        ]);

        const actualKeyCount = result.length > 0 ? result[0].totalKeys : 0;
        const actualActivations = result.length > 0 ? result[0].totalActivations : 0;

        const storedKeyCount = exhibitor.currentLicenseKeyCount ?? 0;
        const storedActivations = exhibitor.currentTotalActivations ?? 0;

        const keyMismatch = storedKeyCount !== actualKeyCount;
        const activationMismatch = storedActivations !== actualActivations;

        if (keyMismatch || activationMismatch) {
          await UserModel.updateOne(
            { _id: exhibitor._id },
            {
              $set: {
                currentLicenseKeyCount: actualKeyCount,
                currentTotalActivations: actualActivations,
              },
            }
          );

          fixedCount++;
          console.log(
            `FIXED: ${exhibitor.email || exhibitor.phoneNumber}\n` +
            `  Keys:        ${storedKeyCount} -> ${actualKeyCount}\n` +
            `  Activations: ${storedActivations} -> ${actualActivations}`
          );
        } else {
          alreadyCorrectCount++;
          console.log(
            `OK:    ${exhibitor.email || exhibitor.phoneNumber} (keys: ${actualKeyCount}, activations: ${actualActivations})`
          );
        }
      } catch (error: any) {
        errorCount++;
        console.error(
          `ERROR: ${exhibitor.email || exhibitor.phoneNumber}: ${error.message}`
        );
      }
    }

    console.log("\n--- Sync Summary ---");
    console.log(`  Fixed:           ${fixedCount}`);
    console.log(`  Already correct: ${alreadyCorrectCount}`);
    console.log(`  Errors:          ${errorCount}`);
    console.log(`  Total:           ${exhibitors.length}`);
    console.log("\nSync completed!");

    process.exit(0);
  } catch (error: any) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

syncLicenseKeyCounts();
