import dotenv from "dotenv";
dotenv.config();

import { connectToMongooseDatabase } from "../config/db.config";
import CatalogModel from "../models/catalog.model";
import { createShortUrl } from "../services/shortUrl.service";

async function backfillShortLinks() {
  try {
    console.log("🚀 Starting short link backfill migration...");

    await connectToMongooseDatabase();

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      console.error("❌ BASE_URL environment variable is not set");
      process.exit(1);
    }

    const catalogs = await CatalogModel.find({ isDeleted: false }).lean();
    console.log(`📋 Found ${catalogs.length} catalog(s) to process`);

    let totalUpdated = 0;

    for (const catalog of catalogs) {
      const raw = catalog as any;

      // Legacy catalogs: file fields are at the top level, no files[]
      if ((!raw.files || raw.files.length === 0) && raw.docLink && !raw.shortLink) {
        const code = await createShortUrl(raw.docLink);
        const shortLink = `${baseUrl}/s/${code}`;
        await CatalogModel.updateOne({ _id: raw._id }, { $set: { shortLink } });
        totalUpdated++;
        console.log(`  ✅ [legacy] ${raw.name}: ${shortLink}`);
        continue;
      }

      // New catalogs: files[] array — backfill any file missing shortLink
      if (raw.files && raw.files.length > 0) {
        let modified = false;
        for (let i = 0; i < raw.files.length; i++) {
          if (!raw.files[i].shortLink) {
            const code = await createShortUrl(raw.files[i].docLink);
            raw.files[i].shortLink = `${baseUrl}/s/${code}`;
            modified = true;
            totalUpdated++;
            console.log(`  ✅ [files[${i}]] ${raw.name} — ${raw.files[i].originalFileName}: ${raw.files[i].shortLink}`);
          }
        }
        if (modified) {
          await CatalogModel.updateOne({ _id: raw._id }, { $set: { files: raw.files } });
        }
      }
    }

    console.log(`\n✅ Migration complete. Generated short links for ${totalUpdated} file(s).`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

backfillShortLinks();
