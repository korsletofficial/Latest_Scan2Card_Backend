import fs from "fs";
import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash"; // Fallback vision model
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini"; // Primary vision model

const DEFAULT_RESPONSE = {
  firstName: "",
  lastName: "",
  company: "",
  position: "",
  emails: [] as string[],      // Array of email addresses
  phoneNumbers: [] as string[], // Array of phone numbers
  website: "",
  address: "",
  city: "",
  country: ""
};

/**
 * Ensures all required keys are present in the response object
 * Handles both string and array fields
 */
function ensureKeys(obj: any): typeof DEFAULT_RESPONSE {
  const out: typeof DEFAULT_RESPONSE = {
    firstName: "",
    lastName: "",
    company: "",
    position: "",
    emails: [],
    phoneNumbers: [],
    website: "",
    address: "",
    city: "",
    country: ""
  };

  if (!obj) return out;

  // Handle string fields
  const stringKeys = ['firstName', 'lastName', 'company', 'position', 'website', 'address', 'city', 'country'];
  for (const k of stringKeys) {
    if (obj[k] && typeof obj[k] === "string" && obj[k].trim() !== "") {
      (out as any)[k] = obj[k].trim();
    }
  }

  // Handle emails array
  if (Array.isArray(obj.emails)) {
    out.emails = obj.emails.filter((e: any) => typeof e === 'string' && e.trim() !== '').map((e: string) => e.trim());
  } else if (obj.email && typeof obj.email === 'string' && obj.email.trim() !== '') {
    // Backward compat: convert single email to array
    out.emails = [obj.email.trim()];
  }

  // Handle phoneNumbers array
  if (Array.isArray(obj.phoneNumbers)) {
    out.phoneNumbers = obj.phoneNumbers.filter((p: any) => typeof p === 'string' && p.trim() !== '').map((p: string) => p.trim());
  } else if (obj.phoneNumber && typeof obj.phoneNumber === 'string' && obj.phoneNumber.trim() !== '') {
    // Backward compat: convert single phone to array
    out.phoneNumbers = [obj.phoneNumber.trim()];
  }

  return out;
}

/**
 * Checks if the object has any non-empty values
 */
function hasAnyValue(obj: any): boolean {
  if (!obj) return false;
  return Object.values(obj).some(v => {
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.trim() !== "";
  });
}

/**
 * Builds the extraction prompt for the AI models
 * Asks the model to extract required keys and translate non-English text
 * Handles multilingual business cards (Hindi, Chinese, Arabic, etc.)
 */
function buildPrompt(): string {
  return `
You are an expert at extracting structured contact info from business cards in ANY language (English, Hindi, Chinese, Arabic, Japanese, etc.).

CRITICAL INSTRUCTIONS:
1) Analyze the image carefully to extract ALL contact information
2) ALWAYS translate any non-English text to English:
   - Hindi text like "मशीनरी स्टोर" → "Machinery Store"
   - Chinese/Japanese → English transliteration/translation
   - Arabic → English translation
3) Clean up extracted text (remove extra spaces, artifacts, special chars)
4) For phone numbers: keep country codes (+91, +1, etc) and digits only
5) Extract ALL email addresses found on the card (there may be multiple)
6) Extract ALL phone numbers found on the card (there may be multiple)
7) If a field is missing, use empty string "" for strings or empty array [] for arrays
8) Output ONLY valid JSON (no markdown, no commentary)

Required JSON format with example:
{
  "firstName": "John",
  "lastName": "Doe",
  "company": "Tech Corporation",
  "position": "CEO",
  "emails": ["john@techcorp.com", "john.doe@gmail.com"],
  "phoneNumbers": ["+1234567890", "+0987654321"],
  "website": "https://www.techcorp.com",
  "address": "123 Tech Street",
  "city": "San Francisco",
  "country": "USA"
}

IMPORTANT: 
- "emails" must be an array of strings (even if only one email)
- "phoneNumbers" must be an array of strings (even if only one phone)

Return ONLY the JSON object, nothing else.
`;
}

/**
 * Calls OpenAI GPT-4o Mini Vision API for image analysis (base64 image)
 * @param imagePath - Path to the image file
 * @returns Extracted data or null if failed
 */
async function callOpenAIVision(imagePath: string): Promise<typeof DEFAULT_RESPONSE | null> {
  if (!OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY not set");
    return null;
  }

  try {
    // Read image and convert to base64
    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Infer mime type from extension
    const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
    const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    const url = "https://api.openai.com/v1/chat/completions";
    // console.log("🔍 Attempting OpenAI GPT-4o Mini API call...");
    // console.log(`📍 URL: ${url}`);
    // console.log(`🔑 API Key (first 8 chars): ${OPENAI_API_KEY?.substring(0, 8)}...`);
    // console.log(`📊 Image size: ${Math.round(base64Image.length / 1024)} KB, type: ${mediaType}`);

    const body = {
      model: OPENAI_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt()
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0.0,
      max_tokens: 1024
    };

    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });

    // console.log(`✅ OpenAI API response status: ${res.status}`);
    // console.log("📦 OpenAI raw response:", JSON.stringify(res.data, null, 2));

    // Extract text from response
    const text = res?.data?.choices?.[0]?.message?.content ?? "";
    if (!text || typeof text !== "string") {
      console.warn("⚠️ OpenAI: No text in response");
      console.warn("📄 Full response:", JSON.stringify(res.data, null, 2));
      return null;
    }

    // console.log("📝 OpenAI extracted text:", text);

    // clean triple-backticks etc
    let cleaned = text.replace(/```json|```/g, "").trim();

    // extract JSON substring if model wrapped text
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.warn("⚠️ OpenAI: No JSON found in response");
      console.warn("📄 Response text:", cleaned.substring(0, 200));
      return null;
    }
    const jsonStr = cleaned.substring(start, end + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      // console.log("📋 OpenAI parsed JSON:", JSON.stringify(parsed, null, 2));
      const result = ensureKeys(parsed);
      // console.log("✅ OpenAI API succeeded with data:", JSON.stringify(result, null, 2));
      return result;
    } catch (err) {
      console.warn("⚠️ OpenAI: JSON parse failed");
      console.warn("📄 JSON string:", jsonStr.substring(0, 200));
      return null;
    }
  } catch (err: any) {
    console.error("❌ OpenAI API failed:");
    console.error(`   Error message: ${err.message}`);
    console.error(`   Error code: ${err.code}`);

    if (err.response) {
      console.error(`   Response status: ${err.response.status}`);
      console.error(`   Response status text: ${err.response.statusText}`);
      console.error(`   Response data:`, JSON.stringify(err.response.data, null, 2));
    } else if (err.request) {
      console.error(`   No response received from server`);
    } else {
      console.error(`   Request setup error:`, err.message);
    }

    return null;
  }
}

/**
 * Calls Gemini Vision API for image analysis (base64 inline_data)
 * @param imagePath - Path to the image file
 * @returns Extracted data or null if failed
 */
async function callGemini(imagePath: string): Promise<typeof DEFAULT_RESPONSE | null> {
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY not set");
    return null;
  }

  const imageBytes = await fs.promises.readFile(imagePath);
  const base64Image = imageBytes.toString("base64");

  // attempt to infer mime type from extension
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const body = {
    contents: [
      {
        parts: [
          { text: buildPrompt() },
          { inline_data: { mime_type: mimeType, data: base64Image } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.0,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048
    }
  };

  try {
    console.log("🔍 Attempting Gemini API call...");
    console.log(`📊 Image size: ${Math.round(base64Image.length / 1024)} KB`);
    const res = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    if (res.status !== 200) {
      console.warn("⚠️ Gemini: Non-200 status:", res.status);
      return null;
    }

    const jsonData = res.data;
    console.log("📦 Gemini raw response:", JSON.stringify(jsonData, null, 2));

    const candidates = jsonData?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.warn("⚠️ Gemini: No candidates in response");
      console.warn("📄 Full response data:", JSON.stringify(jsonData, null, 2));
      return null;
    }

    const content = candidates[0]?.content;
    const parts = content?.parts;
    const text = Array.isArray(parts) && parts.length > 0 ? (parts[0]?.text ?? "") : (candidates[0]?.text ?? "");

    if (!text || typeof text !== "string") {
      console.warn("⚠️ Gemini: No text in response");
      console.warn("📄 Candidate content:", JSON.stringify(content, null, 2));
      return null;
    }

    console.log("📝 Gemini extracted text:", text);

    let cleaned = text.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s === -1 || e === -1) {
      console.warn("⚠️ Gemini: No JSON found in response");
      console.warn("📄 Cleaned text:", cleaned);
      return null;
    }
    const jsonStr = cleaned.substring(s, e + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      console.log("📋 Parsed JSON:", JSON.stringify(parsed, null, 2));
      const result = ensureKeys(parsed);
      console.log("✅ Gemini API succeeded with data:", JSON.stringify(result, null, 2));
      return result;
    } catch (err) {
      console.warn("⚠️ Gemini: JSON parse failed");
      console.warn("📄 JSON string:", jsonStr);
      return null;
    }
  } catch (err: any) {
    console.warn("⚠️ Gemini API failed:", err.message);
    if (err.response) {
      console.error("📄 Error response:", JSON.stringify(err.response.data, null, 2));
    }
    return null;
  }
}

/**
 * Top-level function: Tries OpenAI first, falls back to Gemini if needed
 * @param imagePath - Path to the image file on disk
 * @returns Extracted business card data with all required fields
 */
export async function extractBusinessCardWithFallback(imagePath: string): Promise<typeof DEFAULT_RESPONSE> {
  console.log(`🔄 Starting extraction for image: ${imagePath}`);

  // Check if file exists
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image file not found: ${imagePath}`);
    return { ...DEFAULT_RESPONSE };
  }

  const stats = fs.statSync(imagePath);
  console.log(`📊 Image file size: ${Math.round(stats.size / 1024)} KB`);

  // 1) try OpenAI GPT-4o Mini (Primary)
  try {
    console.log("🎯 Attempting OpenAI extraction...");
    const openai = await callOpenAIVision(imagePath);
    console.log("🔍 OpenAI result:", JSON.stringify(openai, null, 2));

    if (openai && hasAnyValue(openai)) {
      // console.log("✅ Used OpenAI GPT-4o Mini for extraction - SUCCESS");
      return openai;
    } else {
      console.warn("⚠️ OpenAI returned data but hasAnyValue=false");
    }
  } catch (err) {
    // ignore and fallback
    console.warn("⚠️ OpenAI extraction failed, trying fallback:", err);
  }

  // 2) fallback to Gemini
  try {
    // console.log("🎯 Attempting Gemini extraction...");
    const gm = await callGemini(imagePath);
    // console.log("🔍 Gemini result:", JSON.stringify(gm, null, 2));

    if (gm && hasAnyValue(gm)) {
      console.log("✅ Used Gemini for extraction (fallback) - SUCCESS");
      return gm;
    } else {
      console.warn("⚠️ Gemini returned data but hasAnyValue=false");
    }
  } catch (err) {
    // ignore
    console.warn("⚠️ Gemini extraction failed:", err);
  }

  // 3) return empty default
  console.error("❌ All extraction methods failed - returning empty data");
  console.error("❌ This means both OpenAI and Gemini either failed or returned no valid data");
  return { ...DEFAULT_RESPONSE };
}
