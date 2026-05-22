import ShortUrlModel from "../models/shortUrl.model";
import path from "path";

const generateSlug = (fileName: string): string => {
  return path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const createShortUrl = async (originalUrl: string, fileName: string): Promise<string> => {
  const base = generateSlug(fileName);
  let slug = base;
  let counter = 1;

  while (await ShortUrlModel.exists({ slug })) {
    counter++;
    slug = `${base}-${counter}`;
  }

  await ShortUrlModel.create({ slug, originalUrl });
  return slug;
};

export const resolveShortUrl = async (slug: string): Promise<string | null> => {
  const record = await ShortUrlModel.findOne({ slug }).lean();
  return record?.originalUrl ?? null;
};
