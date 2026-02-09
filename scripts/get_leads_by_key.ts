import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const TEAM_MANAGER_ID = "6978579a7fa760ea62df23b1";

async function getLeadsByKey() {
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

    // Step 1: Find all license keys for this team manager
    const events = await db
      .collection("events")
      .find({
        "licenseKeys.teamManagerId": new mongoose.Types.ObjectId(TEAM_MANAGER_ID),
      })
      .toArray();

    if (!events.length) {
      console.log("No events found with license keys for this team manager.");
      await mongoose.disconnect();
      return;
    }

    // Collect all license key strings and event IDs
    const keyEventPairs: { key: string; eventId: mongoose.Types.ObjectId; eventName: string }[] = [];

    for (const event of events) {
      const keys = (event.licenseKeys || []).filter(
        (lk: any) => lk.teamManagerId?.toString() === TEAM_MANAGER_ID
      );
      for (const lk of keys) {
        keyEventPairs.push({
          key: lk.key,
          eventId: event._id as mongoose.Types.ObjectId,
          eventName: event.name,
        });
      }
    }

    console.log(`Found ${keyEventPairs.length} license key(s)\n`);

    let totalLeads = 0;

    for (const pair of keyEventPairs) {
      console.log(`\n========================================`);
      console.log(`Key: ${pair.key} | Event: ${pair.eventName}`);
      console.log(`========================================`);

      // Step 2: Find RSVPs that used this license key
      const rsvps = await db
        .collection("rsvps")
        .find({
          eventLicenseKey: pair.key,
          isDeleted: false,
        })
        .toArray();

      if (!rsvps.length) {
        console.log("  No RSVPs found for this key.");
        continue;
      }

      const userIds = rsvps.map((r: any) => r.userId);
      console.log(`  ${rsvps.length} user(s) activated this key\n`);

      // Step 3: Find leads by those users for this event
      const leads = await db
        .collection("leads")
        .find({
          userId: { $in: userIds },
          eventId: pair.eventId,
          isDeleted: false,
        })
        .toArray();

      if (!leads.length) {
        console.log("  No leads found for this key.");
        continue;
      }

      for (const lead of leads) {
        const d = lead.details || {};
        console.log(`  ─────────────────────────────────`);
        console.log(`  Lead ID:    ${lead._id}`);
        console.log(`  Name:       ${d.firstName || ""} ${d.lastName || ""}`);
        console.log(`  Company:    ${d.company || "N/A"}`);
        console.log(`  Position:   ${d.position || "N/A"}`);
        console.log(`  Emails:     ${(d.emails || []).join(", ") || "N/A"}`);
        console.log(`  Phones:     ${(d.phoneNumbers || []).join(", ") || "N/A"}`);
        console.log(`  Type:       ${lead.leadType}`);
        console.log(`  Rating:     ${lead.rating || "N/A"}`);
        console.log(`  Created:    ${lead.createdAt}`);
        console.log("");
        totalLeads++;
      }
    }

    console.log(`\n============================`);
    console.log(`Total leads found: ${totalLeads}`);
    console.log(`============================`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

getLeadsByKey();
