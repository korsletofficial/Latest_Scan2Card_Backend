import { Schema, Document, model } from "mongoose";

export interface IShortUrl extends Document {
  slug: string;
  originalUrl: string;
  createdAt: Date;
}

const ShortUrlSchema = new Schema<IShortUrl>(
  {
    slug:        { type: String, required: true, unique: true, index: true },
    originalUrl: { type: String, required: true }
  },
  { timestamps: true }
);

export default model<IShortUrl>("ShortUrls", ShortUrlSchema);
