import { extractBusinessCardWithFallback } from "./ocrWithFallback.service";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

// Interface for extracted business card data
export interface BusinessCardData {
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  email?: string;
  phoneNumber?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
}

// Interface for scan result
export interface ScanResult {
  success: boolean;
  data?: {
    ocrText: string;
    details: BusinessCardData;
    confidence: number;
    processingMethod: "image_vision_api" | "ocr_text_analysis";
  };
  error?: string;
}

/**
 * Validates if the image is in base64 format
 */
export const isValidBase64Image = (imageData: string): boolean => {
  const base64Regex = /^data:image\/(jpeg|jpg|png|webp);base64,/;
  return base64Regex.test(imageData) || /^[A-Za-z0-9+/=]+$/.test(imageData);
};

/**
 * Ensures the image has the proper data URL prefix
 */
export const formatImageDataUrl = (imageData: string): string => {
  if (imageData.startsWith("data:image/")) {
    return imageData;
  }
  return `data:image/jpeg;base64,${imageData}`;
};

/**
 * Validates extracted email format
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Cleans and formats phone number
 */
const formatPhoneNumber = (phone: string): string => {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.includes("+")) {
    cleaned = "+" + cleaned.replace(/\+/g, "");
  }
  return cleaned;
};

/**
 * Validates and cleans extracted data; always returns all keys with empty strings when missing.
 */
const validateAndCleanData = (data: BusinessCardData): BusinessCardData => {
  const cleaned: BusinessCardData = {
    firstName: "",
    lastName: "",
    company: "",
    position: "",
    email: "",
    phoneNumber: "",
    website: "",
    address: "",
    city: "",
    country: "",
    notes: "",
  };

  if (data.firstName && data.firstName.trim()) cleaned.firstName = data.firstName.trim();
  if (data.lastName && data.lastName.trim()) cleaned.lastName = data.lastName.trim();
  if (data.company && data.company.trim()) cleaned.company = data.company.trim();
  if (data.position && data.position.trim()) cleaned.position = data.position.trim();

  if (data.email && data.email.trim() && isValidEmail(data.email.trim())) {
    cleaned.email = data.email.trim().toLowerCase();
  }

  if (data.phoneNumber && data.phoneNumber.trim()) {
    cleaned.phoneNumber = formatPhoneNumber(data.phoneNumber);
  }

  if (data.website && data.website.trim()) {
    let website = data.website.trim().toLowerCase();
    if (!website.startsWith("http://") && !website.startsWith("https://")) {
      website = "https://" + website;
    }
    cleaned.website = website;
  }

  if (data.address && data.address.trim()) cleaned.address = data.address.trim();
  if (data.city && data.city.trim()) cleaned.city = data.city.trim();
  if (data.country && data.country.trim()) cleaned.country = data.country.trim();
  if (data.notes && data.notes.trim()) cleaned.notes = data.notes.trim();

  return cleaned;
};

/**
 * Prompt for analyzing OCR-extracted text
 */
const getOCRTextAnalysisPrompt = (): string => {
  return `You are an expert at parsing OCR-extracted text from business cards and converting it into structured JSON format.

CRITICAL INSTRUCTIONS:
1. The text below is raw OCR output which may contain:
   - Mixed languages (English + Hindi/Chinese/Arabic/etc)
   - OCR artifacts and errors
   - Scattered formatting

2. ALWAYS translate ALL non-English text to English before putting in JSON:
   - Hindi text like "मशीनरी स्टोर" → "Machinery Store"
   - Chinese text should be transliterated/translated to English
   - Arabic text should be translated to English

3. Extract and clean the following fields (remove extra spaces/artifacts):
   - firstName: First name (translate if in other language)
   - lastName: Last name (translate if in other language)
   - company: Company/business name (MUST translate to English)
   - position: Job title/role (translate if in other language)
   - email: Email address (usually contains @)
   - phoneNumber: Phone number (keep digits and country codes like +91)
   - website: Website URL (usually starts with http/www)
   - address: Street address (translate if in other language)
   - city: City name (translate if in other language)
   - country: Country name (translate to English)

4. OCR Quality Tips:
   - If you see repeated characters or garbled text, try to interpret the intended word
   - Phone numbers might be separated by spaces/dashes - remove them and keep digits
   - Addresses often span multiple lines - combine them into single string
   - Company names are usually prominent - look for capitalized words

5. Output Format:
   - ONLY valid JSON, no markdown, no extra text
   - All empty fields must be empty strings ""
   - All text must be in English (translated)

OCR Text to Parse:
`;
};

/**
 * Analyzes OCR-extracted text using OpenAI/Gemini with fallback
 */
const analyzeOCRText = async (ocrText: string): Promise<BusinessCardData> => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENAI_API_KEY configured");
  }

  const prompt = getOCRTextAnalysisPrompt();

  // Try OpenAI first (Primary)
  if (OPENAI_API_KEY) {
    try {
      console.log("🔍 Analyzing OCR text with OpenAI...");
      const url = "https://api.openai.com/v1/chat/completions";

      const res = await axios.post(
        url,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: prompt,
            },
            {
              role: "user",
              content: ocrText,
            },
          ],
          temperature: 0.0,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          timeout: 30000,
        }
      );

      const text = res?.data?.choices?.[0]?.message?.content ?? "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("✅ OpenAI OCR analysis succeeded");
        return parsed;
      }
    } catch (err) {
      console.warn("⚠️ OpenAI OCR analysis failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback to Gemini
  if (GEMINI_API_KEY) {
    try {
      console.log("🔍 Analyzing OCR text with Gemini (fallback)...");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

      const res = await axios.post(
        url,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt + ocrText,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.0, maxOutputTokens: 2048 },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      const text = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("✅ Gemini OCR analysis succeeded (fallback)");
        return parsed;
      }
    } catch (err) {
      console.warn("⚠️ Gemini OCR analysis failed:", err instanceof Error ? err.message : String(err));
    }
  }

  console.warn("⚠️ OCR analysis returned no data");
  return {};
};

/**
 * Saves base64 encoded image to a temporary file
 */
const saveBase64ToTempFile = (imageBase64: string): string => {
  let base64Data = imageBase64;
  if (imageBase64.startsWith("data:image/")) {
    base64Data = imageBase64.split(",")[1];
  }

  console.log(`📦 Base64 data length: ${base64Data.length} chars`);

  const tempDir = path.join(process.cwd(), "temp");
  console.log(`📁 Temp directory: ${tempDir}`);

  if (!fs.existsSync(tempDir)) {
    console.log("📁 Creating temp directory...");
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filename = `${uuidv4()}.jpg`;
  const filepath = path.join(tempDir, filename);

  try {
    fs.writeFileSync(filepath, base64Data, "base64");
    const stats = fs.statSync(filepath);
    console.log(`✅ Saved temp file: ${filepath} (${Math.round(stats.size / 1024)} KB)`);
  } catch (error) {
    console.error(`❌ Failed to save temp file: ${filepath}`, error);
    throw error;
  }

  return filepath;
};

/**
 * Scans a business card - can accept either image (base64) or OCR text
 * @param imageBase64OrOCRText - Either base64 encoded image OR OCR text string
 * @param isOCRText - Set to true if input is OCR text, false/undefined for image
 * @returns Scan result with extracted data
 */
export const scanBusinessCard = async (
  imageBase64OrOCRText: string,
  isOCRText: boolean = false
): Promise<ScanResult> => {
  let tempFilePath: string | null = null;

  try {
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      console.error("❌ Neither GEMINI_API_KEY nor OPENAI_API_KEY configured");
      return {
        success: false,
        error: "Vision API keys not configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in environment variables.",
      };
    }

    let extractedData: BusinessCardData;
    let processingMethod: "image_vision_api" | "ocr_text_analysis";

    if (isOCRText) {
      console.log("🔍 Processing business card from OCR text...");
      extractedData = await analyzeOCRText(imageBase64OrOCRText);
      processingMethod = "ocr_text_analysis";
      console.log(`✅ OCR text analyzed successfully. Extracted ${Object.keys(extractedData).length} fields.`);
    } else {
      if (!isValidBase64Image(imageBase64OrOCRText)) {
        return {
          success: false,
          error: "Invalid image format. Please provide a valid base64 encoded image.",
        };
      }

      console.log("🔍 Scanning business card from image using Vision API...");
      tempFilePath = saveBase64ToTempFile(imageBase64OrOCRText);
      extractedData = await extractBusinessCardWithFallback(tempFilePath);
      processingMethod = "image_vision_api";

      const totalFields = Object.keys(extractedData).filter(
        (key) => extractedData[key as keyof BusinessCardData] &&
                 extractedData[key as keyof BusinessCardData]!.toString().trim() !== ""
      ).length;
      console.log(`✅ Business card scanned successfully. Extracted ${totalFields} fields.`);
    }

    const cleanedData = validateAndCleanData(extractedData);

    const totalFields = Object.keys(cleanedData).filter(
      (key) => cleanedData[key as keyof BusinessCardData] &&
               cleanedData[key as keyof BusinessCardData]!.toString().trim() !== ""
    ).length;
    const confidence = Math.min(totalFields / 6, 1);

    return {
      success: true,
      data: {
        ocrText: isOCRText ? imageBase64OrOCRText : JSON.stringify(extractedData),
        details: cleanedData,
        confidence: parseFloat(confidence.toFixed(2)),
        processingMethod,
      },
    };
  } catch (error: any) {
    console.error("❌ Error scanning business card:", error);

    if (error.code === "invalid_api_key") {
      return {
        success: false,
        error: "Invalid API key",
      };
    }

    if (error.code === "rate_limit_exceeded") {
      return {
        success: false,
        error: "API rate limit exceeded. Please try again later.",
      };
    }

    if (error.code === "insufficient_quota") {
      return {
        success: false,
        error: "API quota exceeded. Please check your billing.",
      };
    }

    return {
      success: false,
      error: error.message || "Failed to scan business card",
    };
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("🗑️ Cleaned up temporary file");
      } catch (cleanupError) {
        console.warn("⚠️ Failed to clean up temporary file:", cleanupError);
      }
    }
  }
};

/**
 * Batch scan multiple business cards (for future use)
 */
export const batchScanBusinessCards = async (
  images: string[]
): Promise<ScanResult[]> => {
  const results: ScanResult[] = [];

  for (const image of images) {
    const result = await scanBusinessCard(image);
    results.push(result);
  }

  return results;
};
