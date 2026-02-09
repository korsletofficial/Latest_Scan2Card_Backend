import mongoose from "mongoose";
import axios from "axios";
import readline from "readline";
import { scanBusinessCard, BusinessCardData } from "../src/services/businessCardScanner.service";

const TEAM_MANAGER_ID = "6978579a7fa760ea62df23b1";
const MAX_IMAGES_PER_LEAD = 2;

// Fields to compare
const COMPARE_FIELDS: (keyof BusinessCardData)[] = [
  "firstName", "lastName", "company", "position",
  "emails", "phoneNumbers",
  "website", "address", "city", "zipcode", "country",
];

// Download image from S3 URL and return base64
async function downloadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const base64 = Buffer.from(response.data).toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch (err: any) {
    console.error(`  Failed to download image: ${err.message}`);
    return null;
  }
}

// Merge two scan results, taking non-empty values
function mergeScanResults(a: BusinessCardData, b: BusinessCardData): BusinessCardData {
  const merged: BusinessCardData = { ...a };

  for (const key of COMPARE_FIELDS) {
    const valA = a[key];
    const valB = b[key];

    if (Array.isArray(valA) && Array.isArray(valB)) {
      // Union of arrays (deduplicated, case-insensitive for emails)
      const combined = [...(valA as string[]), ...(valB as string[])];
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const item of combined) {
        const normalized = key === "emails" ? item.toLowerCase() : item;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          deduped.push(item);
        }
      }
      (merged as any)[key] = deduped;
    } else {
      // For string fields, prefer non-empty value
      const strA = (valA as string) || "";
      const strB = (valB as string) || "";
      if (!strA.trim() && strB.trim()) {
        (merged as any)[key] = strB;
      }
    }
  }

  return merged;
}

// Compare DB details vs scanned details
function compareDetails(
  dbDetails: any,
  scannedDetails: BusinessCardData
): { field: string; dbValue: string; scannedValue: string; status: string }[] {
  const rows: { field: string; dbValue: string; scannedValue: string; status: string }[] = [];

  for (const field of COMPARE_FIELDS) {
    const dbVal = dbDetails?.[field];
    const scanVal = scannedDetails[field];

    const dbStr = Array.isArray(dbVal) ? (dbVal as string[]).join(", ") : (dbVal || "").toString().trim();
    const scanStr = Array.isArray(scanVal) ? (scanVal as string[]).join(", ") : (scanVal || "").toString().trim();

    let status: string;
    if (!dbStr && !scanStr) {
      status = "- Empty";
    } else if (!dbStr && scanStr) {
      status = "⚠ MISSING IN DB";
    } else if (dbStr && !scanStr) {
      status = "~ Only in DB";
    } else if (dbStr.toLowerCase() === scanStr.toLowerCase()) {
      status = "✓ Match";
    } else {
      status = "⚠ DIFFERENT";
    }

    rows.push({ field, dbValue: dbStr || "(empty)", scannedValue: scanStr || "(empty)", status });
  }

  return rows;
}

// Prompt user for input
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Find phone numbers in scanned data that are not in DB
function findMissingPhoneNumbers(dbPhones: string[], scannedPhones: string[]): string[] {
  const normalizePhone = (p: string) => p.replace(/[\s\-\(\)\.]/g, "");
  const dbNormalized = new Set(dbPhones.map(normalizePhone));
  return scannedPhones.filter((p) => !dbNormalized.has(normalizePhone(p)));
}

// Print comparison table
function printTable(rows: { field: string; dbValue: string; scannedValue: string; status: string }[]) {
  // Calculate dynamic column widths based on content
  const minWidths = { field: 14, db: 10, scan: 10, status: 18 };
  const colWidths = {
    field: minWidths.field,
    db: Math.max(minWidths.db, ...rows.map((r) => r.dbValue.length), "DB Value".length),
    scan: Math.max(minWidths.scan, ...rows.map((r) => r.scannedValue.length), "Scanned Value".length),
    status: minWidths.status,
  };

  const pad = (s: string, w: number) => s.padEnd(w);

  console.log(
    `  ${pad("Field", colWidths.field)} | ${pad("DB Value", colWidths.db)} | ${pad("Scanned Value", colWidths.scan)} | ${pad("Status", colWidths.status)}`
  );
  console.log(`  ${"-".repeat(colWidths.field + colWidths.db + colWidths.scan + colWidths.status + 9)}`);

  for (const row of rows) {
    console.log(
      `  ${pad(row.field, colWidths.field)} | ${pad(row.dbValue, colWidths.db)} | ${pad(row.scannedValue, colWidths.scan)} | ${pad(row.status, colWidths.status)}`
    );
  }
}

async function main() {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/scan2card";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB\n");

    const db = mongoose.connection.db;
    if (!db) {
      console.error("Database connection not established");
      await mongoose.disconnect();
      return;
    }

    // Step 1: Find license keys for team manager
    const events = await db
      .collection("events")
      .find({
        "licenseKeys.teamManagerId": new mongoose.Types.ObjectId(TEAM_MANAGER_ID),
      })
      .toArray();

    if (!events.length) {
      console.log("No events found for this team manager.");
      await mongoose.disconnect();
      return;
    }

    // Collect license key strings and event IDs
    const keyEventPairs: { key: string; eventId: mongoose.Types.ObjectId }[] = [];
    for (const event of events) {
      const keys = (event.licenseKeys || []).filter(
        (lk: any) => lk.teamManagerId?.toString() === TEAM_MANAGER_ID
      );
      for (const lk of keys) {
        keyEventPairs.push({ key: lk.key, eventId: event._id as mongoose.Types.ObjectId });
      }
    }

    console.log(`Found ${keyEventPairs.length} license key(s)\n`);

    // Step 2: Find user IDs via RSVPs
    const allLicenseKeys = keyEventPairs.map((p) => p.key);
    const rsvps = await db
      .collection("rsvps")
      .find({ eventLicenseKey: { $in: allLicenseKeys }, isDeleted: false })
      .toArray();

    const userEventMap = new Map<string, Set<string>>();
    for (const rsvp of rsvps) {
      const uid = rsvp.userId.toString();
      if (!userEventMap.has(uid)) userEventMap.set(uid, new Set());
      // Map user to their event IDs
      userEventMap.get(uid)!.add(rsvp.eventId.toString());
    }

    const userIds = [...userEventMap.keys()].map((id) => new mongoose.Types.ObjectId(id));
    const eventIds = keyEventPairs.map((p) => p.eventId);

    console.log(`Found ${userIds.length} user(s) across RSVPs\n`);

    // Step 3: Fetch leads with images
    const leads = await db
      .collection("leads")
      .find({
        userId: { $in: userIds },
        eventId: { $in: eventIds },
        isDeleted: false,
        leadType: "full_scan",
        "images.0": { $exists: true }, // has at least one image
      })
      .toArray();

    console.log(`Found ${leads.length} lead(s) with images to rescan\n`);

    if (!leads.length) {
      await mongoose.disconnect();
      return;
    }

    // Stats
    let totalScanned = 0;
    let leadsWithDifferences = 0;
    let totalMissingInDb = 0;
    let totalDifferent = 0;
    let failedScans = 0;
    let totalPhonesAdded = 0;

    // Step 4: Rescan each lead
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const images: string[] = lead.images || [];
      const imagesToScan = images.slice(0, MAX_IMAGES_PER_LEAD);

      console.log(`\n${"=".repeat(80)}`);
      console.log(`Lead ${i + 1}/${leads.length} | ID: ${lead._id}`);
      console.log(`Name: ${lead.details?.firstName || ""} ${lead.details?.lastName || ""}`);
      console.log(`Images: ${imagesToScan.length} to scan`);
      console.log(`${"=".repeat(80)}`);

      let mergedScan: BusinessCardData | null = null;

      for (let j = 0; j < imagesToScan.length; j++) {
        const imageUrl = imagesToScan[j];
        console.log(`\n  Downloading image ${j + 1}: ${imageUrl.substring(0, 80)}...`);

        const base64 = await downloadImageAsBase64(imageUrl);
        if (!base64) {
          console.log(`  Skipping image ${j + 1} - download failed`);
          continue;
        }

        console.log(`  Scanning image ${j + 1}...`);
        const result = await scanBusinessCard(base64, false);

        if (result.success && result.data) {
          console.log(`  Scan ${j + 1} successful (confidence: ${result.data.confidence})`);
          if (!mergedScan) {
            mergedScan = result.data.details;
          } else {
            mergedScan = mergeScanResults(mergedScan, result.data.details);
          }
        } else {
          console.log(`  Scan ${j + 1} failed: ${result.error}`);
        }
      }

      if (!mergedScan) {
        console.log(`\n  ❌ All scans failed for this lead`);
        failedScans++;
        continue;
      }

      totalScanned++;

      // Step 5: Compare
      const comparison = compareDetails(lead.details, mergedScan);

      console.log(`\n  Comparison:`);
      printTable(comparison);

      const missingInDb = comparison.filter((r) => r.status === "⚠ MISSING IN DB");
      const different = comparison.filter((r) => r.status === "⚠ DIFFERENT");

      if (missingInDb.length > 0 || different.length > 0) {
        leadsWithDifferences++;
        totalMissingInDb += missingInDb.length;
        totalDifferent += different.length;
      }

      // Check for missing phone numbers and prompt to add
      const dbPhones: string[] = lead.details?.phoneNumbers || [];
      const scannedPhones: string[] = mergedScan.phoneNumbers || [];
      const missingPhones = findMissingPhoneNumbers(dbPhones, scannedPhones);

      if (missingPhones.length > 0) {
        console.log(`\n  📞 ${missingPhones.length} phone number(s) found in scan but NOT in DB:`);
        console.log(`  DB has:     [${dbPhones.join(", ")}]`);
        console.log(`  Scan found: [${scannedPhones.join(", ")}]`);
        console.log(`  Missing:    [${missingPhones.join(", ")}]\n`);

        const phonesToAdd: string[] = [];

        for (let p = 0; p < missingPhones.length; p++) {
          const phone = missingPhones[p];
          const answer = await prompt(`  [${p + 1}/${missingPhones.length}] ${phone} — Press ENTER to add, or 's' to skip: `);
          if (answer.toLowerCase() === "s") {
            console.log(`    ⏭ Skipped`);
          } else {
            phonesToAdd.push(phone);
            console.log(`    ✔ Queued for adding`);
          }
        }

        if (phonesToAdd.length > 0) {
          const updatedPhones = [...dbPhones, ...phonesToAdd];
          await db.collection("leads").updateOne(
            { _id: lead._id },
            { $set: { "details.phoneNumbers": updatedPhones } }
          );
          totalPhonesAdded += phonesToAdd.length;
          console.log(`\n  ✅ Added ${phonesToAdd.length} phone number(s) to DB: [${updatedPhones.join(", ")}]`);
        } else {
          console.log(`\n  ⏭ No phones added for this lead`);
        }
      } else {
        console.log(`\n  ✓ No missing phone numbers`);
      }
    }

    // Summary
    console.log(`\n${"=".repeat(80)}`);
    console.log(`SUMMARY`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Total leads with images:     ${leads.length}`);
    console.log(`Successfully rescanned:      ${totalScanned}`);
    console.log(`Failed to scan:              ${failedScans}`);
    console.log(`Leads with differences:      ${leadsWithDifferences}`);
    console.log(`Total fields missing in DB:  ${totalMissingInDb}`);
    console.log(`Total fields different:       ${totalDifferent}`);
    console.log(`Phone numbers added to DB:   ${totalPhonesAdded}`);
    console.log(`${"=".repeat(80)}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
