import fs from "fs";
import axios from "axios";
import FormData from "form-data";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash"; // Primary vision model
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini"; // Fallback vision model

const DEFAULT_RESPONSE = {
  firstName: "",
  lastName: "",
  company: "",
  position: "",
  email: "",
  phoneNumber: "",
  website: "",
  address: "",
  city: "",
  country: ""
};

/**
 * Ensures all required keys are present in the response object
 */
function ensureKeys(obj: any): typeof DEFAULT_RESPONSE {
  const out = { ...DEFAULT_RESPONSE };
  for (const k of Object.keys(out)) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && typeof obj[k] === "string" && obj[k].trim() !== "") {
      out[k as keyof typeof DEFAULT_RESPONSE] = obj[k].trim();
    } else {
      out[k as keyof typeof DEFAULT_RESPONSE] = "";
    }
  }
  return out;
}

/**
 * Checks if the object has any non-empty values
 */
function hasAnyValue(obj: any): boolean {
  if (!obj) return false;
  return Object.values(obj).some(v => typeof v === "string" && v.trim() !== "");
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
5) If a field is missing, use empty string ""
6) Output ONLY valid JSON (no markdown, no commentary)

Required JSON format with example:
{
  "firstName": "John",
  "lastName": "Doe",
  "company": "Tech Corporation",
  "position": "CEO",
  "email": "john@techcorp.com",
  "phoneNumber": "+1234567890",
  "website": "https://www.techcorp.com",
  "address": "123 Tech Street",
  "city": "San Francisco",
  "country": "USA"
}

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
    console.log("🔍 Attempting OpenAI GPT-4o Mini API call...");
    console.log(`📍 URL: ${url}`);
    console.log(`🔑 API Key (first 8 chars): ${OPENAI_API_KEY?.substring(0, 8)}...`);

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

    console.log(`✅ OpenAI API response status: ${res.status}`);

    // Extract text from response
    const text = res?.data?.choices?.[0]?.message?.content ?? "";
    if (!text || typeof text !== "string") {
      console.warn("⚠️ OpenAI: No text in response");
      return null;
    }

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
      const result = ensureKeys(parsed);
      console.log("✅ OpenAI API succeeded");
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
    const res = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    if (res.status !== 200) {
      console.warn("⚠️ Gemini: Non-200 status:", res.status);
      return null;
    }

    const jsonData = res.data;
    const candidates = jsonData?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.warn("⚠️ Gemini: No candidates in response");
      return null;
    }

    const content = candidates[0]?.content;
    const parts = content?.parts;
    const text = Array.isArray(parts) && parts.length > 0 ? (parts[0]?.text ?? "") : (candidates[0]?.text ?? "");

    if (!text || typeof text !== "string") {
      console.warn("⚠️ Gemini: No text in response");
      return null;
    }

    let cleaned = text.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s === -1 || e === -1) {
      console.warn("⚠️ Gemini: No JSON found in response");
      return null;
    }
    const jsonStr = cleaned.substring(s, e + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      const result = ensureKeys(parsed);
      console.log("✅ Gemini API succeeded");
      return result;
    } catch (err) {
      console.warn("⚠️ Gemini: JSON parse failed");
      return null;
    }
  } catch (err: any) {
    console.warn("⚠️ Gemini API failed:", err.message);
    return null;
  }
}

/**
 * Top-level function: Tries Gemini first, falls back to OpenAI GPT-4o Mini if needed
 * @param imagePath - Path to the image file on disk
 * @returns Extracted business card data with all required fields
 */
export async function extractBusinessCardWithFallback(imagePath: string): Promise<typeof DEFAULT_RESPONSE> {
  // 1) try Gemini (Primary)
  try {
    const gm = await callGemini(imagePath);
    if (gm && hasAnyValue(gm)) {
      console.log("✅ Used Gemini for extraction");
      return gm;
    }
  } catch (err) {
    // ignore and fallback
    console.warn("⚠️ Gemini extraction failed, trying fallback");
  }

  // 2) fallback to OpenAI GPT-4o Mini
  try {
    const openai = await callOpenAIVision(imagePath);
    if (openai && hasAnyValue(openai)) {
      console.log("✅ Used OpenAI GPT-4o Mini for extraction (fallback)");
      return openai;
    }
  } catch (err) {
    // ignore
    console.warn("⚠️ OpenAI extraction failed");
  }

  // 3) return empty default
  console.error("❌ All extraction methods failed");
  return { ...DEFAULT_RESPONSE };
}
