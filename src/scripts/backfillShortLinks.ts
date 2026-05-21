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

    // Find all active catalogs that have at least one file without a shortLink
    const catalogs = await CatalogModel.find({
      isDeleted: false,
      "files.shortLink": { $exists: false }
    });

    console.log(`📋 Found ${catalogs.length} catalog(s) with files missing short links`);

    let totalFilesUpdated = 0;

    for (const catalog of catalogs) {
      let modified = false;

      for (const file of catalog.files) {
        if (!file.shortLink) {
          const code = await createShortUrl(file.docLink);
          file.shortLink = `${baseUrl}/s/${code}`;
          modified = true;
          totalFilesUpdated++;
          console.log(`  ✅ Created short link for: ${file.originalFileName} → ${file.shortLink}`);
        }
      }

      if (modified) {
        await catalog.save();
        console.log(`💾 Saved catalog: ${catalog.name}`);
      }
    }

    console.log(`\n✅ Migration complete. Updated ${totalFilesUpdated} file(s) across ${catalogs.length} catalog(s).`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

backfillShortLinks();
