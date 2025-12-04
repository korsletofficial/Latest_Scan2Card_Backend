import axios from "axios";
import * as cheerio from "cheerio";
import VCard from "vcard-parser";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";
// Uncomment and configure if you want LLM fallback
// import OpenAI from "openai";

// Detect if we're in production (serverless) or local development
const isProduction = process.env.NODE_ENV === "production" || process.env.AWS_EXECUTION_ENV || process.env.RENDER;

// Interface for extracted contact data
export interface QRContactData {
  title?: string; // Mr., Ms., Dr., etc.
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  department?: string; // Department within company
  email?: string;
  phoneNumber?: string;
  mobile?: string; // Mobile phone (separate from phoneNumber)
  fax?: string; // Fax number
  website?: string;
  address?: string;
  streetName?: string; // Street address (alias for address)
  zipCode?: string; // Postal code
  city?: string;
  country?: string;
  notes?: string;
  uniqueCode?: string; // Optional entry/unique code (9-15 chars)
}

// Interface for QR processing result
export interface QRProcessResult {
  success: boolean;
  type: "url" | "vcard" | "plaintext" | "entry_code" | "mailto" | "tel";
  data?: {
    details?: QRContactData;
    entryCode?: string;
    rawData: string;
    confidence: number;
    rating?: number; // Quality score (1-5)
  };
  error?: string;
}

/**
 * Detects if text is a URL
 */
const isURL = (text: string): boolean => {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Detects if text is a vCard
 */
const isVCard = (text: string): boolean => {
  return text.trim().startsWith("BEGIN:VCARD") && text.includes("END:VCARD");
};

/**
 * Detects if text is just an entry code (short alphanumeric code)
 * Entry codes are typically short (3-30 chars), alphanumeric, and don't contain contact info
 */
const isEntryCode = (text: string): boolean => {
  const trimmed = text.trim();

  // Must be between 3 and 30 characters
  if (trimmed.length < 3 || trimmed.length > 30) {
    return false;
  }

  // Should not contain spaces, newlines, or special characters except hyphen/underscore
  if (!/^[A-Za-z0-9\-_]+$/.test(trimmed)) {
    return false;
  }

  // Should not look like a URL, email, or phone number
  if (trimmed.includes('.') || trimmed.includes('@') || trimmed.includes('/')) {
    return false;
  }

  // If it matches these criteria, it's likely an entry code
  return true;
};

/**
 * Validates if text is a valid name (filters out common non-name terms)
 */
const isValidName = (text: string): boolean => {
  if (!text || text.length < 2 || text.length > 100) {
    return false;
  }

  // Pattern: alphabetic characters with optional spaces, hyphens, apostrophes
  const namePattern = /^[A-Za-z]+([\s\-'][A-Za-z]+)*$/;
  if (!namePattern.test(text)) {
    return false;
  }

  // Filter out common non-name terms
  const invalidTerms = /(download|phone|email|address|website|contact|card|call|directions|fax|mobile|office|home)/i;
  if (invalidTerms.test(text)) {
    return false;
  }

  return true;
};

/**
 * Validates if text is a valid company name
 */
const isValidCompany = (text: string): boolean => {
  if (!text || text.length < 2 || text.length > 100) {
    return false;
  }

  // Should not contain email addresses
  if (text.includes('@')) {
    return false;
  }

  // Should not start with a phone number
  if (/^\+?\d/.test(text)) {
    return false;
  }

  // Filter out job titles that might be mistaken for company names
  const jobTitles = /(director|manager|ceo|cto|cfo|engineer|developer|designer|download|phone|email)/i;
  if (jobTitles.test(text)) {
    return false;
  }

  return true;
};

/**
 * Validates if text is a valid position/job title
 */
const isValidPosition = (text: string): boolean => {
  if (!text || text.length < 2 || text.length > 100) {
    return false;
  }

  // Common position keywords
  const positionKeywords = [
    'manager', 'director', 'engineer', 'developer', 'designer', 'analyst',
    'specialist', 'coordinator', 'officer', 'executive', 'president',
    'vice', 'assistant', 'associate', 'senior', 'junior', 'lead',
    'head', 'chief', 'ceo', 'cto', 'cfo', 'coo', 'consultant'
  ];

  const textLower = text.toLowerCase();
  return positionKeywords.some(keyword => textLower.includes(keyword));
};

/**
 * Calculate rating based on data completeness (1-5 scale)
 */
const calculateRating = (contactData: QRContactData): number => {
  const email = contactData.email;
  const phone = contactData.phoneNumber || contactData.mobile;
  const name = contactData.firstName || contactData.lastName;
  const company = contactData.company;
  const position = contactData.position;

  // Best: has both contact methods + name + company
  if (email && phone && name && company) return 5;

  // Great: has both contact methods + name
  if (email && phone && name) return 4;

  // Good: has one contact method + name + company
  if ((email || phone) && name && company) return 4;

  // Decent: has one contact method + name
  if ((email || phone) && name) return 3;

  // Minimal: has at least one contact method
  if (email || phone) return 3;

  // Poor: missing critical contact info
  if (name || company) return 2;

  return 1;
};

/**
 * Extracts email from text using regex
 */
const extractEmail = (text: string): string | undefined => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : undefined;
};

/**
 * Extracts phone number from text using regex
 */
const extractPhone = (text: string): string | undefined => {
  // Multiple phone regex patterns to catch various formats
  const phonePatterns = [
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,5}/, // US/Canada format with extensions
    /(\+?\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4})/, // International format
    /\+?\d{10,15}/, // Simple international
    /(\(\d{3}\)\s?\d{3}[-.\s]\d{4})/, // (123) 456-7890
    /(\d{3}[-.\s]\d{3}[-.\s]\d{4})/, // 123-456-7890 or 123 456 7890
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Clean up the phone number
      const cleaned = match[0].replace(/[^\d+\-\s()]/g, '').trim();
      // Validate: should have at least 7 digits, at most 15
      const digitCount = cleaned.replace(/[^\d]/g, '').length;
      if (digitCount >= 7 && digitCount <= 15) {
        return cleaned;
      }
    }
  }
  return undefined;
};

/**
 * Extracts unique code (9-15 alphanumeric characters) from text
 * Looks for patterns like: code=ABC123, UniqueCode: ABC123, NOTE:UniqueCode=ABC123
 */
const extractUniqueCode = (text: string): string | undefined => {
  // Pattern 1: Key-value pairs (code=, uniqueCode=, unique_code=, entryCode=, entry_code=)
  const keyValuePatterns = [
    /(?:code|uniquecode|unique_code|entrycode|entry_code|uniqueid|unique_id)\s*[=:]\s*([A-Za-z0-9]{9,15})/i,
    /NOTE\s*:\s*(?:code|uniquecode|unique_code)\s*[=:]\s*([A-Za-z0-9]{9,15})/i,
  ];

  for (const pattern of keyValuePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Pattern 2: Standalone alphanumeric code (9-15 chars) on its own line or after label
  const standalonePattern = /\b([A-Za-z0-9]{9,15})\b/g;
  const matches = text.match(standalonePattern);

  if (matches) {
    // Filter out common non-code patterns (phone numbers, emails, URLs)
    for (const match of matches) {
      // Skip if it looks like phone number (too many digits)
      const digitCount = match.replace(/[^\d]/g, '').length;
      if (digitCount > 10) continue;

      // Skip if it's all numbers (likely phone/zip)
      if (/^\d+$/.test(match)) continue;

      // Skip if it's part of email or URL context
      const context = text.substring(Math.max(0, text.indexOf(match) - 10), text.indexOf(match) + match.length + 10);
      if (context.includes('@') || context.includes('http') || context.includes('www')) continue;

      // This looks like a valid unique code
      return match;
    }
  }

  return undefined;
};

/**
 * Parses mailto: link and extracts contact information
 */
const parseMailtoLink = (mailtoLink: string): QRContactData => {
  const contactData: QRContactData = {};

  try {
    // Remove 'mailto:' prefix
    const emailPart = mailtoLink.replace('mailto:', '');
    const [email, queryString] = emailPart.split('?');

    contactData.email = decodeURIComponent(email.trim());

    // Parse query parameters if present
    if (queryString) {
      const params = new URLSearchParams(queryString);

      // Extract subject and body as notes
      const subject = params.get('subject');
      const body = params.get('body');

      if (subject || body) {
        const notes = [];
        if (subject) notes.push(`Subject: ${subject}`);
        if (body) notes.push(`Body: ${body}`);
        contactData.notes = notes.join(' | ');
      }
    }
  } catch (error: any) {
    console.error('Error parsing mailto link:', error.message);
  }

  return contactData;
};

/**
 * Parses tel: link and extracts phone number
 */
const parseTelLink = (telLink: string): QRContactData => {
  const contactData: QRContactData = {};

  try {
    // Remove 'tel:' prefix and clean up
    const phoneNumber = telLink
      .replace('tel:', '')
      .replace(/[^\d+\-\s()]/g, '')
      .trim();

    contactData.phoneNumber = phoneNumber;
    contactData.mobile = phoneNumber; // Also set as mobile
  } catch (error: any) {
    console.error('Error parsing tel link:', error.message);
  }

  return contactData;
};

/**
 * Delay utility for retry logic
 */
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Scrapes contact information from a webpage
 */
const fieldMap: Record<string, keyof QRContactData> = {
  // Common alternates for each field
  firstname: "firstName",
  given_name: "firstName",
  lastname: "lastName",
  surname: "lastName",
  org: "company",
  organization: "company",
  company: "company",
  job_title: "position",
  title: "position",
  email: "email",
  mail: "email",
  phone: "phoneNumber",
  tel: "phoneNumber",
  mobile: "phoneNumber",
  website: "website",
  url: "website",
  address: "address",
  street: "address",
  city: "city",
  locality: "city",
  country: "country",
  country_name: "country",
  notes: "notes",
  note: "notes",
};

const scrapeWebpage = async (url: string, retryAttempts: number = 3): Promise<QRContactData> => {
  let lastError: Error | null = null;

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 10,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      // Try JSON first
      if (typeof response.data === "object") {
        const contactData: QRContactData = {};
        for (const [key, value] of Object.entries(response.data)) {
          const mapped = fieldMap[key.toLowerCase()];
          if (mapped && value) contactData[mapped] = String(value);
        }
        // Always store website
        contactData.website = url;
        return contactData;
      }

      // Otherwise, treat as HTML
      const $ = cheerio.load(response.data);
      const contactData: QRContactData = {};

      // ...existing Cheerio extraction code...

      // Parse JSON-LD structured data first
      $('script[type="application/ld+json"]').each((_, elem) => {
        try {
          const htmlContent = $(elem).html();
          if (!htmlContent) return;
          const jsonData = JSON.parse(htmlContent);
          if (jsonData && typeof jsonData === 'object') {
            // Handle both single objects and arrays
            const entities = Array.isArray(jsonData) ? jsonData : [jsonData];

            for (const entity of entities) {
              if (entity['@type'] === 'Person' || entity.type === 'Person') {
                if (entity.name && !contactData.firstName) {
                  const nameParts = entity.name.split(' ');
                  if (nameParts.length >= 2) {
                    contactData.firstName = nameParts[0];
                    contactData.lastName = nameParts.slice(1).join(' ');
                  } else {
                    contactData.firstName = entity.name;
                  }
                }
                if (entity.givenName) contactData.firstName = entity.givenName;
                if (entity.familyName) contactData.lastName = entity.familyName;
                if (entity.jobTitle) contactData.position = entity.jobTitle;
                if (entity.organization?.name) contactData.company = entity.organization.name;
                if (entity.email) contactData.email = entity.email;
                if (entity.telephone) contactData.phoneNumber = entity.telephone;
                if (entity.address) {
                  if (entity.address.streetAddress) contactData.address = entity.address.streetAddress;
                  if (entity.address.addressLocality) contactData.city = entity.address.addressLocality;
                  if (entity.address.addressCountry) contactData.country = entity.address.addressCountry;
                  if (entity.address.postalCode) contactData.zipCode = entity.address.postalCode;
                }
              }
            }
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
      });

      // Helper to try selectors and map to schema
      const trySelectors = (selectors: string[], field: keyof QRContactData, maxLen = 200) => {
        for (const selector of selectors) {
          const val = $(selector).attr("content") || $(selector).text().trim();
          if (val && val.length < maxLen) {
            contactData[field] = val;
            break;
          }
        }
      };

      // ...existing selector tries...

      // Always store the URL as website
      contactData.website = url;

      // ...existing fallback and validation code...

      // If we have at least a name, email, or phone, return
      if (
        (contactData.firstName && isValidName(contactData.firstName)) ||
        (contactData.email && contactData.email.length > 3) ||
        (contactData.phoneNumber && contactData.phoneNumber.length > 5)
      ) {
        return contactData;
      }

      // If Cheerio failed, try Puppeteer as fallback for dynamic content
      console.log("🌐 Cheerio extraction failed or incomplete, trying Puppeteer for:", url);

      // Use different Puppeteer config based on environment
      let browser;
      if (isProduction) {
        // Production: Use puppeteer-core with serverless chromium
        console.log("🔧 Using serverless Chromium for production");
        browser = await puppeteerCore.launch({
          args: chromium.args,
          defaultViewport: { width: 1920, height: 1080 },
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      } else {
        // Local: Use regular puppeteer with bundled Chrome
        console.log("🔧 Using local Puppeteer for development");
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }

      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      // Wait for dynamic content to load
      await new Promise(r => setTimeout(r, 3000));
      // Extract visible text from main card area
      const textContent = await page.evaluate(() => {
        const selectors = [
          '.vcard', '.card', '.profile', '.container', '.main', '.business-card', 'body'
        ];
        let card = null;
        for (const sel of selectors) {
          // @ts-ignore
          card = document.querySelector(sel);
          // @ts-ignore
          if (card && card.innerText.trim().length > 0) break;
        }
        // @ts-ignore
        return card ? card.innerText : document.body.innerText;
      });
      await browser.close();

      // Try to extract fields from the visible text
      const fallbackData: QRContactData = {};
      // Extract email
      fallbackData.email = extractEmail(textContent);
      // Extract phone
      fallbackData.phoneNumber = extractPhone(textContent);
      // Try to extract name from first line
      const lines = textContent.split("\n").filter((line: string) => line.trim());
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        if (
          firstLine.length < 50 &&
          !firstLine.includes("@") &&
          !firstLine.match(/\d{3}/)
        ) {
          const nameParts = firstLine.split(" ");
          if (nameParts.length >= 2) {
            fallbackData.firstName = nameParts[0];
            fallbackData.lastName = nameParts.slice(1).join(" ");
          } else {
            fallbackData.firstName = firstLine;
          }
        }
      }
      // Try to extract company from second or third line
      if (lines.length > 1) {
        const possibleCompany = lines[1].trim();
        if (isValidCompany(possibleCompany)) {
          fallbackData.company = possibleCompany;
        }
      }
      // Try to extract position from third or fourth line
      if (lines.length > 2) {
        const possiblePosition = lines[2].trim();
        if (isValidPosition(possiblePosition)) {
          fallbackData.position = possiblePosition;
        }
      }
      fallbackData.website = url;
      return fallbackData;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      // If this isn't the last attempt, wait with exponential backoff
      if (attempt < retryAttempts - 1) {
        const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.log(`⏳ Retry attempt ${attempt + 1}/${retryAttempts} after ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }

  // All retries failed
  console.error("❌ Error scraping webpage after", retryAttempts, "attempts:", lastError?.message);
  // Return at least the URL
  return { website: url };
};

/**
 * Parses vCard data
 */
const parseVCard = (vcardText: string): QRContactData => {
  try {
    const parsed = VCard.parse(vcardText);
    const contactData: QRContactData = {};

    if (parsed && parsed.fn) {
      // Parse full name
      const fullName = parsed.fn[0].value;
      const nameParts = fullName.split(" ");
      if (nameParts.length >= 2) {
        contactData.firstName = nameParts[0];
        contactData.lastName = nameParts.slice(1).join(" ");
      } else {
        contactData.firstName = fullName;
      }
    }

    // Parse structured name if available
    if (parsed && parsed.n && parsed.n[0]) {
      const n = parsed.n[0].value;
      if (n.length >= 2) {
        contactData.lastName = n[0];
        contactData.firstName = n[1];
      }
    }

    // Parse organization
    if (parsed && parsed.org) {
      contactData.company = parsed.org[0].value;
    }

    // Parse title/position
    if (parsed && parsed.title) {
      contactData.position = parsed.title[0].value;
    }

    // Parse email
    if (parsed && parsed.email) {
      contactData.email = parsed.email[0].value;
    }

    // Parse phone
    if (parsed && parsed.tel) {
      contactData.phoneNumber = parsed.tel[0].value;
    }

    // Parse URL/website
    if (parsed && parsed.url) {
      contactData.website = parsed.url[0].value;
    }

    // Parse address
    if (parsed && parsed.adr && parsed.adr[0]) {
      const addr = parsed.adr[0].value;
      if (Array.isArray(addr)) {
        // addr format: [po-box, extended, street, city, region, postal, country]
        if (addr[2]) contactData.address = addr[2]; // street
        if (addr[3]) contactData.city = addr[3]; // city
        if (addr[6]) contactData.country = addr[6]; // country
      }
    }

    // Parse NOTE field for unique code (optional)
    // Example: NOTE:UniqueCode=ABC123XYZ or NOTE:ABC123XYZ456
    if (parsed && parsed.note && parsed.note[0]) {
      const noteValue = parsed.note[0].value;
      const uniqueCode = extractUniqueCode(noteValue);
      if (uniqueCode) {
        contactData.uniqueCode = uniqueCode;
        console.log(`📌 Extracted unique code from vCard NOTE: ${uniqueCode}`);
      }
    }

    // Also try extracting from the raw vCard text (in case NOTE isn't parsed correctly)
    if (!contactData.uniqueCode) {
      const uniqueCode = extractUniqueCode(vcardText);
      if (uniqueCode) {
        contactData.uniqueCode = uniqueCode;
        console.log(`📌 Extracted unique code from vCard raw text: ${uniqueCode}`);
      }
    }

    return contactData;
  } catch (error: any) {
    console.error("Error parsing vCard:", error.message);
    throw new Error("Failed to parse vCard data");
  }
};

/**
 * Extracts contact info from plain text
 */
const parsePlainText = (text: string): QRContactData => {
  const contactData: QRContactData = {};

  // Extract email
  contactData.email = extractEmail(text);

  // Extract phone
  contactData.phoneNumber = extractPhone(text);

  // Extract unique code (optional)
  const uniqueCode = extractUniqueCode(text);
  if (uniqueCode) {
    contactData.uniqueCode = uniqueCode;
    console.log(`📌 Extracted unique code from plain text: ${uniqueCode}`);
  }

  // Try to extract name from first line
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    // If first line looks like a name (less than 50 chars, no email/phone)
    if (
      firstLine.length < 50 &&
      !firstLine.includes("@") &&
      !firstLine.match(/\d{3}/)
    ) {
      const nameParts = firstLine.split(" ");
      if (nameParts.length >= 2) {
        contactData.firstName = nameParts[0];
        contactData.lastName = nameParts.slice(1).join(" ");
      } else {
        contactData.firstName = firstLine;
      }
    }
  }

  // Do not include notes in the response

  return contactData;
};

/**
 * Processes QR code text and extracts contact information
 */
export const processQRCode = async (
  qrText: string
): Promise<QRProcessResult> => {
  try {
    if (!qrText || qrText.trim().length === 0) {
      return {
        success: false,
        type: "plaintext",
        error: "QR code text is empty",
      };
    }

    const trimmedText = qrText.trim();

    // Check if it's an entry code (do this first as it's the simplest)
    if (isEntryCode(trimmedText)) {
      console.log("🎫 Detected entry code in QR code");
      return {
        success: true,
        type: "entry_code",
        data: {
          entryCode: trimmedText,
          rawData: trimmedText,
          confidence: 1.0,
          rating: 1,
        },
      };
    }

    // Check if it's a mailto: link
    if (trimmedText.toLowerCase().startsWith('mailto:')) {
      console.log("📧 Detected mailto link in QR code");
      const contactData = parseMailtoLink(trimmedText);
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "mailto",
        data: {
          details: contactData,
          rawData: trimmedText,
          confidence: contactData.email ? 1.0 : 0.5,
          rating,
        },
      };
    }

    // Check if it's a tel: link
    if (trimmedText.toLowerCase().startsWith('tel:')) {
      console.log("📞 Detected tel link in QR code");
      const contactData = parseTelLink(trimmedText);
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "tel",
        data: {
          details: contactData,
          rawData: trimmedText,
          confidence: contactData.phoneNumber ? 1.0 : 0.5,
          rating,
        },
      };
    }

    // Check if it's a URL
    if (isURL(trimmedText)) {
      console.log("🌐 Detected URL in QR code, scraping webpage...");
      const contactData = await scrapeWebpage(trimmedText);

      // Optionally: Use LLM to fill missing fields (uncomment and configure)
      /*
      if (Object.values(contactData).filter(Boolean).length < 6) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `Extract contact info (firstName, lastName, company, position, email, phoneNumber, website, address, city, country) from this HTML or JSON. Return as JSON.`;
        const llmResult = await openai.chat.completions.create({
          model: "gpt-4-turbo",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: response.data },
          ],
        });
        try {
          const llmJson = JSON.parse(llmResult.choices[0].message.content);
          Object.assign(contactData, llmJson);
        } catch {}
      }
      */

      // Calculate confidence based on fields found
      const fieldCount = Object.values(contactData).filter(
        (v) => v && v.length > 0
      ).length;
      const confidence = Math.min(fieldCount / 10, 1); // Normalize to 0-1 (10 fields)
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "url",
        data: {
          details: contactData,
          rawData: trimmedText,
          confidence: parseFloat(confidence.toFixed(2)),
          rating,
        },
      };
    }

    // Check if it's a vCard
    if (isVCard(trimmedText)) {
      console.log("📇 Detected vCard in QR code, parsing...");
      const contactData = parseVCard(trimmedText);

      // Calculate confidence based on fields found
      const fieldCount = Object.values(contactData).filter(
        (v) => v && v.length > 0
      ).length;
      const confidence = Math.min(fieldCount / 5, 1);
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "vcard",
        data: {
          details: contactData,
          rawData: trimmedText,
          confidence: parseFloat(confidence.toFixed(2)),
          rating,
        },
      };
    }

    // Treat as plain text
    console.log("📄 Detected plain text in QR code, extracting info...");
    const contactData = parsePlainText(trimmedText);

    // Calculate confidence
    const fieldCount = Object.values(contactData).filter(
      (v) => v && v.length > 0
    ).length;
    const confidence = fieldCount > 0 ? Math.min(fieldCount / 3, 1) : 0.3;
    const rating = calculateRating(contactData);

    return {
      success: true,
      type: "plaintext",
      data: {
        details: contactData,
        rawData: trimmedText,
        confidence: parseFloat(confidence.toFixed(2)),
        rating,
      },
    };
  } catch (error: any) {
    console.error("❌ Error processing QR code:", error);
    return {
      success: false,
      type: "plaintext",
      error: error.message || "Failed to process QR code",
    };
  }
};
