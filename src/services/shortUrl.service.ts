import crypto from "crypto";
import ShortUrlModel from "../models/shortUrl.model";

const generateCode = (): string =>
  crypto.randomBytes(6).toString("base64url").slice(0, 8);

export const createShortUrl = async (originalUrl: string): Promise<string> => {
  let code: string;
  let attempts = 0;

  do {
    code = generateCode();
    attempts++;
    if (attempts > 10) throw new Error("Failed to generate unique short code");
  } while (await ShortUrlModel.exists({ code }));

  await ShortUrlModel.create({ code, originalUrl });
  return code;
};

export const resolveShortUrl = async (code: string): Promise<string | null> => {
  const record = await ShortUrlModel.findOne({ code }).lean();
  return record?.originalUrl ?? null;
};
