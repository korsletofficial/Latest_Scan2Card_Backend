import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const TEAM_MANAGER_ID = "6978579a7fa760ea62df23b1";

async function getLicenseKeys() {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/scan2card";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB\n");

    const db = mongoose.connection.db;
    if (!db) {
      console.error("Database connection not established");
      await mongoose.disconnect();
      return;
    }

    const events = await db
      .collection("events")
      .find({
        "licenseKeys.teamManagerId": new mongoose.Types.ObjectId(
          TEAM_MANAGER_ID
        ),
      })
      .toArray();

    if (!events.length) {
      console.log("No events found with license keys for this team manager.");
      await mongoose.disconnect();
      return;
    }

    let totalKeys = 0;

    for (const event of events) {
      const keys = (event.licenseKeys || []).filter(
        (lk: any) => lk.teamManagerId?.toString() === TEAM_MANAGER_ID
      );

      if (keys.length) {
        console.log(`Event: ${event.name} (${event._id})`);
        console.log("-".repeat(50));

        for (const lk of keys) {
          console.log(`  Key:        ${lk.key}`);
          console.log(`  Stall:      ${lk.stallName || "N/A"}`);
          console.log(`  Email:      ${lk.email}`);
          console.log(`  Active:     ${lk.isActive}`);
          console.log(`  Expires:    ${lk.expiresAt}`);
          console.log(`  Used:       ${lk.usedCount}/${lk.maxActivations}`);
          console.log("");
          totalKeys++;
        }
      }
    }

    console.log(`Total license keys found: ${totalKeys}`);
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

getLicenseKeys();
