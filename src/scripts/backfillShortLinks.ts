import dotenv from "dotenv";
dotenv.config();

import { connectToMongooseDatabase } from "../config/db.config";
import CatalogModel from "../models/catalog.model";
import { createShortUrl } from "../services/shortUrl.service";

async function backfillShortLinks() {
  try {
    console.log("🚀 Starting short code backfill migration...");

    await connectToMongooseDatabase();

    if (!process.env.CATALOG_BASE_URL) {
      console.error("❌ CATALOG_BASE_URL environment variable is not set");
      process.exit(1);
    }

    const catalogs = await CatalogModel.find({ isDeleted: false }).lean();
    console.log(`📋 Found ${catalogs.length} catalog(s) to process`);

    let totalUpdated = 0;

    for (const catalog of catalogs) {
      const raw = catalog as any;

      // Legacy catalogs: file fields at top level, no files[]
      if ((!raw.files || raw.files.length === 0) && raw.docLink && !raw.shortCode) {
        const slug = await createShortUrl(raw.docLink, raw.originalFileName || raw.name);
        await CatalogModel.updateOne({ _id: raw._id }, { $set: { shortCode: slug } });
        totalUpdated++;
        console.log(`  ✅ [legacy] ${raw.name}: /catalogue/${slug}`);
        continue;
      }

      // New catalogs: files[] array — backfill any file missing shortCode
      if (raw.files && raw.files.length > 0) {
        let modified = false;
        for (let i = 0; i < raw.files.length; i++) {
          if (!raw.files[i].shortCode) {
            const slug = await createShortUrl(raw.files[i].docLink, raw.files[i].originalFileName);
            raw.files[i].shortCode = slug;
            modified = true;
            totalUpdated++;
            console.log(`  ✅ [files[${i}]] ${raw.name} — ${raw.files[i].originalFileName}: /catalogue/${slug}`);
          }
        }
        if (modified) {
          await CatalogModel.updateOne({ _id: raw._id }, { $set: { files: raw.files } });
        }
      }
    }

    console.log(`\n✅ Migration complete. Generated slugs for ${totalUpdated} file(s).`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

backfillShortLinks();
