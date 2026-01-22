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
  emails?: string[];       // Array of email addresses
  phoneNumbers?: string[]; // Array of phone numbers
  website?: string;
  address?: string;
  city?: string;
  zipcode?: string;
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
 * Validates and cleans extracted data; always returns all keys with empty arrays/strings when missing.
 */
const validateAndCleanData = (data: BusinessCardData): BusinessCardData => {
  const cleaned: BusinessCardData = {
    firstName: "",
    lastName: "",
    company: "",
    position: "",
    emails: [],
    phoneNumbers: [],
    website: "",
    address: "",
    city: "",
    zipcode: "",
    country: "",
    notes: "",
  };

  if (data.firstName && data.firstName.trim()) cleaned.firstName = data.firstName.trim();
  if (data.lastName && data.lastName.trim()) cleaned.lastName = data.lastName.trim();
  if (data.company && data.company.trim()) cleaned.company = data.company.trim();
  if (data.position && data.position.trim()) cleaned.position = data.position.trim();

  // Handle emails array
  if (Array.isArray(data.emails)) {
    cleaned.emails = data.emails
      .map(e => e.trim().replace(/\s+/g, '').toLowerCase())
      .filter(e => isValidEmail(e));
    if (cleaned.emails.length > 0) {
      console.log(`✅ Validated ${cleaned.emails.length} email(s): ${cleaned.emails.join(', ')}`);
    }
  } else if ((data as any).email && typeof (data as any).email === 'string') {
    // Backward compat: handle single email field
    const emailCleaned = (data as any).email.trim().replace(/\s+/g, '').toLowerCase();
    if (isValidEmail(emailCleaned)) {
      cleaned.emails = [emailCleaned];
      console.log(`✅ Email validated and cleaned: ${emailCleaned}`);
    }
  }

  // Handle phoneNumbers array
  if (Array.isArray(data.phoneNumbers)) {
    cleaned.phoneNumbers = data.phoneNumbers
      .map(p => formatPhoneNumber(p))
      .filter(p => p.length >= 6); // Basic validation: at least 6 digits
    if (cleaned.phoneNumbers.length > 0) {
      console.log(`✅ Validated ${cleaned.phoneNumbers.length} phone(s): ${cleaned.phoneNumbers.join(', ')}`);
    }
  } else if ((data as any).phoneNumber && typeof (data as any).phoneNumber === 'string') {
    // Backward compat: handle single phone field
    const phoneCleaned = formatPhoneNumber((data as any).phoneNumber);
    if (phoneCleaned.length >= 6) {
      cleaned.phoneNumbers = [phoneCleaned];
    }
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
  if (data.zipcode && data.zipcode.trim()) cleaned.zipcode = data.zipcode.trim();
  if (data.country && data.country.trim()) cleaned.country = data.country.trim();
  if (data.notes && data.notes.trim()) cleaned.notes = data.notes.trim();

  return cleaned;
};

/**
 * Prompt for analyzing OCR-extracted text
 */
const getOCRTextAnalysisPrompt = (): string => {
  return `Parse this OCR text from a business card and extract ALL information. Translate any Indian language text to English.

CRITICAL: Extract EVERY piece of information from the text below, including:
- Person's FULL NAME (first name + last name) - THIS IS CRITICAL, don't leave empty!
- Job title/Position (Owner, Proprietor, Manager, Director, etc.)
- Company/Business name
- ALL phone numbers
- ALL email addresses
- Website
- Address, City, Zipcode, Country

IMPORTANT: For Zipcode, also look for terms like "Pin Code", "Postal Code", "ZIP", "Zip Code", and extract the number that follows. For Indian business cards, Pin Code is commonly used for zipcode.

INDIAN LANGUAGE TRANSLATION:
If text is in Hindi, Tamil, Telugu, Bengali, Marathi, Kannada, Malayalam, Gujarati, Punjabi, Urdu, translate to English.

Translation examples:

Hindi: "राजेश कुमार" → "Rajesh Kumar", "प्रबंधक" → "Manager", "मालिक" → "Owner", "मुंबई" → "Mumbai"
Tamil: "ராஜேஷ்" → "Rajesh", "சென்னை" → "Chennai"
Telugu: "రాజేష్" → "Rajesh", "హైదరాబాద్" → "Hyderabad"
Bengali: "রাজেশ" → "Rajesh", "কোলকাতা" → "Kolkata"
Marathi: "राजेश" → "Rajesh", "पुणे" → "Pune"
Kannada: "ರಾಜೇಶ್" → "Rajesh", "ಬೆಂಗಳೂರು" → "Bengaluru"
Malayalam: "രാജേഷ്" → "Rajesh"
Gujarati: "રાજેશ" → "Rajesh"
Punjabi: "ਰਾਜੇਸ਼" → "Rajesh"
Urdu: "راجیش" → "Rajesh"

EXTRACTION INSTRUCTIONS:
1. READ ALL THE TEXT CAREFULLY - The person's name is usually the most prominent text
2. FIND THE NAME - Don't leave firstName/lastName empty! If you see a name, extract it
3. FIND JOB TITLE - Look for: Owner, Proprietor, Director, Manager, "प्रबंधक", "मालिक", "निदेशक"
4. FIND COMPANY NAME - The business name
5. FIND ALL PHONE NUMBERS - Add +91 for Indian numbers: "9876543210" → "+919876543210"
6. FIND ALL EMAIL ADDRESSES - Look for @ symbol
7. FIND WEBSITE - Look for www or .com
8. FIND ADDRESS, CITY, ZIPCODE (including Pin Code, Postal Code, ZIP, Zip Code) & COUNTRY - Translate Indian language text
9. TRANSLATE all Indian language text to English

The OCR text may contain information from BOTH sides of the card - merge everything into ONE contact.

Phone formatting: Remove spaces/dashes and add +91 for Indian numbers
- "98765-43210" → "+919876543210"
- "9876543210" → "+919876543210"

Output format (return ONLY valid JSON, no markdown):
{
  "firstName": "Rajesh",
  "lastName": "Kumar",
  "company": "Machinery Trading Company",
  "position": "Owner",
  "emails": ["email@example.com"],
  "phoneNumbers": ["+919876543210"],
  "website": "https://example.com",
  "address": "Shop No. 45, MG Road",
  "city": "Mumbai",
  "zipcode": "400001",
  "country": "India"
}

CRITICAL:
- Don't leave firstName/lastName empty if you see a person's name in the text!
- Translate ALL Indian language text to English
- Return ONLY valid JSON (no markdown, no explanations)
- "emails" and "phoneNumbers" must be arrays

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
          model: "gpt-4o", // Using gpt-4o for superior Indian language OCR accuracy and translation
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
      console.log("📝 OpenAI raw response text:", text);
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let parsed = JSON.parse(jsonMatch[0]);
        console.log("📋 OpenAI parsed data:", JSON.stringify(parsed, null, 2));

        // Handle contacts array format (when OpenAI detects multiple cards)
        if (parsed.contacts && Array.isArray(parsed.contacts) && parsed.contacts.length > 0) {
          console.log("🔄 Detected contacts array, merging contact data...");
          // Merge all contacts, prioritizing non-empty values from first contact
          const merged: BusinessCardData = {};

          for (const contact of parsed.contacts) {
            // Handle array fields specifically
            if (contact.emails && Array.isArray(contact.emails)) {
              merged.emails = [...(merged.emails || []), ...contact.emails];
            } else if (contact.email && typeof contact.email === 'string') {
              merged.emails = [...(merged.emails || []), contact.email];
            }

            if (contact.phoneNumbers && Array.isArray(contact.phoneNumbers)) {
              merged.phoneNumbers = [...(merged.phoneNumbers || []), ...contact.phoneNumbers];
            } else if (contact.phoneNumber && typeof contact.phoneNumber === 'string') {
              merged.phoneNumbers = [...(merged.phoneNumbers || []), contact.phoneNumber];
            }

            // Handle string fields
            const stringKeys: (Exclude<keyof BusinessCardData, "emails" | "phoneNumbers">)[] = [
              'firstName', 'lastName', 'company', 'position',
              'website', 'address', 'city', 'zipcode', 'country', 'notes'
            ];

            for (const key of stringKeys) {
              const currentValue = merged[key];
              const newValue = contact[key];

              // Only set if we don't have a value yet, or current value is empty
              if (!currentValue || (typeof currentValue === 'string' && currentValue.trim() === "")) {
                if (newValue && typeof newValue === 'string' && newValue.trim()) {
                  merged[key] = newValue;
                }
              }
            }
          }

          // Deduplicate arrays
          if (merged.emails) merged.emails = [...new Set(merged.emails)];
          if (merged.phoneNumbers) merged.phoneNumbers = [...new Set(merged.phoneNumbers)];

          console.log("✅ Merged contact data:", JSON.stringify(merged, null, 2));
          parsed = merged;
        }

        console.log("✅ OpenAI OCR analysis succeeded");
        return parsed;
      } else {
        console.warn("⚠️ No JSON found in OpenAI response");
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
      console.log("🔍 Raw extracted data before validation:", JSON.stringify(extractedData, null, 2));
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
    // console.log("🧹 Cleaned data after validation:", JSON.stringify(cleanedData, null, 2));

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
