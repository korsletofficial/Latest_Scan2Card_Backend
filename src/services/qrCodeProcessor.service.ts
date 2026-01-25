import VCard from "vcard-parser";
import puppeteer from "puppeteer-core";
import axios from "axios";

// Browserless API configuration
// Uses WebSocket with Puppeteer (Option 2 from Browserless docs) - recommended by Browserless
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || '';
const BROWSERLESS_WS_ENDPOINT = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;

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
  website?: string;
  address?: string;
  streetName?: string; // Street address (alias for address)
  city?: string;
  zipcode?: string; // Postal/ZIP code
  country?: string;
  uniqueCode?: string; // Optional entry/unique code (9-15 chars)
}

/**
 * Normalizes contact data to ensure all required fields are present with empty strings
 */
const normalizeContactData = (data: QRContactData): QRContactData => {
  const normalized = {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    company: data.company || '',
    position: data.position || '',
    email: data.email || '',
    phoneNumber: data.phoneNumber || '',
    website: data.website || '',
    address: data.address || '',
    city: data.city || '',
    zipcode: data.zipcode || '',
    country: data.country || '',
    ...data, // Preserve other fields like title, department, etc.
  };

  // Remove uniqueCode from the response
  // (uniqueCode is already passed separately as entryCode)
  delete normalized.uniqueCode;

  return normalized;
};

// Interface for QR processing result
export interface QRProcessResult {
  success: boolean;
  type: "url" | "vcard" | "plaintext" | "entry_code" | "mailto" | "tel";
  data?: {
    details?: QRContactData;
    entryCode?: string;
    rawData: string;
    confidence: number;
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
    const email = emailPart.split('?')[0];

    contactData.email = decodeURIComponent(email.trim());
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
 * Extracts email from text using regex
 */
const extractEmailFromText = (text: string): string | undefined => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : undefined;
};

/**
 * Extracts phone number from text using regex
 */
const extractPhoneFromText = (text: string): string | undefined => {
  const phonePatterns = [
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,5}/,
    /(\+?\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4})/,
    /\+?\d{10,15}/,
    /(\(\d{3}\)\s?\d{3}[-.\s]\d{4})/,
    /(\d{3}[-.\s]\d{3}[-.\s]\d{4})/,
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[0].replace(/[^\d+\-\s()]/g, '').trim();
      const digitCount = cleaned.replace(/[^\d]/g, '').length;
      if (digitCount >= 7 && digitCount <= 15) {
        return cleaned;
      }
    }
  }
  return undefined;
};

/**
 * Validates if text is a valid name
 */
const isValidName = (text: string): boolean => {
  if (!text || text.length < 2 || text.length > 100) return false;
  const namePattern = /^[A-Za-z]+([\s\-'][A-Za-z]+)*$/;
  if (!namePattern.test(text)) return false;
  const invalidTerms = /(download|phone|email|address|website|contact|card|call|directions|mobile|office|home)/i;
  return !invalidTerms.test(text);
};

/**
 * Validates if text is a valid company name
 */
const isValidCompany = (text: string): boolean => {
  if (!text || text.length < 2 || text.length > 100) return false;
  if (text.includes('@') || /^\+?\d/.test(text)) return false;
  const jobTitles = /(director|manager|ceo|cto|cfo|engineer|developer|designer|download|phone|email)/i;
  return !jobTitles.test(text);
};

/**
 * Validates if text is a valid position/job title
 */
const isValidPosition = (text: string): boolean => {
  if (!text || text.length < 2 || text.length > 100) return false;
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
 * Parses QRCodeChimp embedded payload
 */
const parseQRCodeChimpPayload = (rawScript: string, fallbackUrl: string): QRContactData | null => {
  if (!rawScript) return null;

  try {
    const payload = JSON.parse(rawScript);
    const content = Array.isArray(payload?.content) ? payload.content : [];
    const contactData: QRContactData = {};

    const ensureWebsite = (): string | undefined => {
      if (payload?.short_url) {
        const shortUrl: string = payload.short_url;
        if (shortUrl.startsWith('http')) return shortUrl;
        return `https://linko.page/${shortUrl}`;
      }
      return fallbackUrl;
    };

    const setIfEmpty = (key: keyof QRContactData, value?: string): void => {
      if (value && !contactData[key]) {
        contactData[key] = value;
      }
    };

    const profileComponent = content.find((item: any) => item?.component === 'profile');
    if (profileComponent?.name) {
      const nameParts = String(profileComponent.name).trim().split(/\s+/);
      setIfEmpty('firstName', nameParts[0]);
      if (nameParts.length > 1) {
        setIfEmpty('lastName', nameParts.slice(1).join(' '));
      }
    }

    setIfEmpty('company', profileComponent?.company);
    setIfEmpty('position', profileComponent?.desc);

    if (Array.isArray(profileComponent?.contact_shortcuts)) {
      for (const shortcut of profileComponent.contact_shortcuts) {
        if (shortcut?.type === 'mobile') setIfEmpty('phoneNumber', shortcut.value);
        if (shortcut?.type === 'email') setIfEmpty('email', shortcut.value);
      }
    }

    const contactComponent = content.find((item: any) => item?.component === 'contact');
    if (Array.isArray(contactComponent?.contact_infos)) {
      for (const info of contactComponent.contact_infos) {
        if (info?.type === 'email') setIfEmpty('email', info.email);
        if (info?.type === 'number' || info?.type === 'mobile') {
          setIfEmpty('phoneNumber', info.number ?? info.value);
        }
        if (info?.type === 'address') {
          setIfEmpty('address', info.street ?? info.address);
          setIfEmpty('city', info.city ?? info.town);
          setIfEmpty('country', info.country);
        }
      }
    }

    setIfEmpty('website', ensureWebsite());

    const hasData = Object.values(contactData).some((value) => Boolean(value));
    return hasData ? contactData : null;
  } catch (error: any) {
    console.error('Failed to parse embedded QR template payload:', error?.message || error);
    return null;
  }
};

/**
 * Scrapes contact information from a webpage using Browserless API
 * Uses WebSocket with Puppeteer (Option 2 from Browserless docs)
 * Recommended by Browserless for better handling of dynamic/JS-heavy pages
 */
const scrapeWebpage = async (url: string): Promise<QRContactData> => {
  let browser;

  try {
    if (!BROWSERLESS_API_KEY) {
      console.warn("⚠️ BROWSERLESS_API_KEY not configured, returning URL only");
      return { website: url };
    }

    console.log(`🌐 Scraping webpage using Browserless WebSocket: ${url}`);

    // Connect to Browserless via WebSocket
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_WS_ENDPOINT,
    });

    const page = await browser.newPage();

    // Navigate to the page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract all data from the page
    const extractedData = await page.evaluate(() => {
      const result: any = {};

      // @ts-ignore - Code runs in browser context
      result.bodyText = document.body.innerText;

      // Try to find JSON-LD structured data
      // @ts-ignore
      const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
      if (jsonLdScript) {
        result.jsonLd = jsonLdScript.textContent;
      }

      // Try to find QRCodeChimp embedded data
      // @ts-ignore
      const scripts = Array.from(document.scripts);
      for (const script of scripts) {
        // @ts-ignore
        const text = script.textContent || '';
        if (text.includes('__savedQrCodeParams')) {
          const match = text.match(/__savedQrCodeParams\s*=\s*(\{[\s\S]*?\});?/);
          if (match && match[1]) {
            result.qrCodeChimpData = match[1];
          }
        }
      }

      // Extract mailto links
      // @ts-ignore
      const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      result.emails = mailtoLinks.map((a: any) => a.href.replace('mailto:', '').split('?')[0]);

      // Extract tel links
      // @ts-ignore
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      result.phones = telLinks.map((a: any) => a.href.replace('tel:', '').trim());

      // Try common selectors for name
      // @ts-ignore
      result.h1 = document.querySelector('h1')?.textContent?.trim() || '';
      // @ts-ignore
      result.nameClass = document.querySelector('.name, .person-name, .full-name')?.textContent?.trim() || '';

      // Try to get company
      // @ts-ignore
      result.company = document.querySelector('.company, .organization, [itemprop="worksFor"]')?.textContent?.trim() || '';

      // Try to get position/title
      // @ts-ignore
      result.position = document.querySelector('.title, .job-title, .position, [itemprop="jobTitle"]')?.textContent?.trim() || '';

      return result;
    });

    await browser.close();
    browser = undefined;

    console.log("✅ Browserless extracted data");

    // Parse the extracted data
    const contactData: QRContactData = { website: url };
    const fullText = extractedData.bodyText || '';

    // 1. Try QRCodeChimp embedded payload first (most reliable)
    if (extractedData.qrCodeChimpData) {
      console.log('🧩 Embedded QR template payload detected');
      const parsedData = parseQRCodeChimpPayload(extractedData.qrCodeChimpData, url);
      if (parsedData) {
        Object.keys(parsedData).forEach((key) => {
          const k = key as keyof QRContactData;
          if (parsedData[k] && !contactData[k]) {
            contactData[k] = parsedData[k];
          }
        });
      }
    }

    // 2. Try JSON-LD structured data
    if (extractedData.jsonLd && !contactData.firstName) {
      try {
        const jsonLd = JSON.parse(extractedData.jsonLd);
        if (jsonLd['@type'] === 'Person') {
          if (jsonLd.name) {
            const nameParts = jsonLd.name.split(' ');
            contactData.firstName = nameParts[0];
            if (nameParts.length > 1) {
              contactData.lastName = nameParts.slice(1).join(' ');
            }
          }
          if (jsonLd.givenName) contactData.firstName = jsonLd.givenName;
          if (jsonLd.familyName) contactData.lastName = jsonLd.familyName;
          if (jsonLd.email) contactData.email = jsonLd.email;
          if (jsonLd.telephone) contactData.phoneNumber = jsonLd.telephone;
          if (jsonLd.jobTitle) contactData.position = jsonLd.jobTitle;
          if (jsonLd.worksFor?.name) contactData.company = jsonLd.worksFor.name;
          console.log("✅ Extracted data from JSON-LD");
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // 3. Extract emails (first valid one)
    if (!contactData.email && extractedData.emails?.length > 0) {
      for (const email of extractedData.emails) {
        const validEmail = extractEmailFromText(email);
        if (validEmail) {
          contactData.email = validEmail;
          break;
        }
      }
    }

    // 4. Extract phone numbers (first valid one)
    if (!contactData.phoneNumber && extractedData.phones?.length > 0) {
      for (const phone of extractedData.phones) {
        const validPhone = extractPhoneFromText(phone);
        if (validPhone) {
          contactData.phoneNumber = validPhone;
          break;
        }
      }
    }

    // 5. Extract name from h1 or name class
    if (!contactData.firstName && extractedData.nameClass) {
      const nameText = extractedData.nameClass;
      if (isValidName(nameText)) {
        const nameParts = nameText.split(' ');
        if (nameParts.length >= 2) {
          contactData.firstName = nameParts[0];
          contactData.lastName = nameParts.slice(1).join(' ');
        } else {
          contactData.firstName = nameText;
        }
      }
    }

    if (!contactData.firstName && extractedData.h1) {
      const h1Text = extractedData.h1;
      if (h1Text.length < 100 && isValidName(h1Text)) {
        const nameParts = h1Text.split(' ');
        if (nameParts.length >= 2) {
          contactData.firstName = nameParts[0];
          contactData.lastName = nameParts.slice(1).join(' ');
        } else {
          contactData.firstName = h1Text;
        }
      }
    }

    // 6. Extract company and position from selectors
    if (!contactData.company && extractedData.company) {
      if (isValidCompany(extractedData.company)) {
        contactData.company = extractedData.company;
      }
    }

    if (!contactData.position && extractedData.position) {
      if (isValidPosition(extractedData.position)) {
        contactData.position = extractedData.position;
      }
    }

    // 7. Fallback: Extract from plain text
    if (!contactData.email && fullText) {
      contactData.email = extractEmailFromText(fullText);
    }

    if (!contactData.phoneNumber && fullText) {
      contactData.phoneNumber = extractPhoneFromText(fullText);
    }

    // 8. Try to extract name from the beginning of text
    if (!contactData.firstName && fullText) {
      const lines = fullText.split("\n").filter((line: string) => line.trim());
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (
          trimmedLine.length >= 3 &&
          trimmedLine.length < 50 &&
          !trimmedLine.includes("@") &&
          !trimmedLine.match(/\d{3}/) &&
          isValidName(trimmedLine)
        ) {
          const nameParts = trimmedLine.split(" ");
          if (nameParts.length >= 2) {
            contactData.firstName = nameParts[0];
            contactData.lastName = nameParts.slice(1).join(" ");
          } else {
            contactData.firstName = trimmedLine;
          }
          break;
        }
      }
    }

    // 9. Try to extract company from text
    if (!contactData.company && fullText) {
      const lines = fullText.split("\n").filter((line: string) => line.trim());
      for (let i = 1; i < Math.min(lines.length, 5); i++) {
        const line = lines[i].trim();
        if (line.length > 2 && line.length < 100 && isValidCompany(line)) {
          contactData.company = line;
          break;
        }
      }
    }

    // 10. Try to extract position from text
    if (!contactData.position && fullText) {
      const lines = fullText.split("\n").filter((line: string) => line.trim());
      for (let i = 1; i < Math.min(lines.length, 5); i++) {
        const line = lines[i].trim();
        if (line.length > 2 && line.length < 100 && isValidPosition(line)) {
          contactData.position = line;
          break;
        }
      }
    }

    console.log("✨ Final contact data:", JSON.stringify(contactData, null, 2));
    return contactData;

  } catch (error: any) {
    console.error("❌ Error calling Browserless API:", error.message);

    // Clean up browser if still open
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Return at least the URL if Browserless fails
    return { website: url };
  }
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
        if (addr[5]) contactData.zipcode = addr[5]; // postal code
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
 * Prompt for analyzing QR code plain text with AI
 */
const getQRTextAnalysisPrompt = (): string => {
  return `Parse this text from a QR code and extract ALL contact information. The text may be pipe-delimited, comma-delimited, or in any other format.

CRITICAL: Extract EVERY piece of information, including:
- Person's FULL NAME (first name + last name)
- Job title/Position
- Company/Business name
- ALL phone numbers (format with country code, e.g., +919876543210)
- ALL email addresses
- Website
- Full Address
- City
- Zipcode/Pin Code/Postal Code
- Country

IMPORTANT RULES:
1. For phone numbers: Extract ALL numbers, add +91 for Indian 10-digit numbers
2. For emails: Extract ALL email addresses found
3. For address: Look for flat/plot numbers, building names, street names, area names
4. For zipcode: Look for 5-6 digit codes (Indian pincode is 6 digits)
5. Skip GST numbers, registration codes, and other business identifiers
6. If text contains separators like | or , treat each segment as a different field

Output format (return ONLY valid JSON, no markdown):
{
  "firstName": "",
  "lastName": "",
  "company": "",
  "position": "",
  "emails": [],
  "phoneNumbers": [],
  "website": "",
  "address": "",
  "city": "",
  "zipcode": "",
  "country": ""
}

CRITICAL:
- "emails" and "phoneNumbers" must be arrays
- Return ONLY valid JSON (no markdown, no explanations)
- Extract as much data as possible from the text

Text to Parse:
`;
};

/**
 * Analyzes QR code plain text using OpenAI/Gemini
 */
const analyzeQRTextWithAI = async (text: string): Promise<QRContactData> => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    console.warn("⚠️ No AI API keys configured, falling back to regex parsing");
    return {};
  }

  const prompt = getQRTextAnalysisPrompt();

  // Try OpenAI first (Primary)
  if (OPENAI_API_KEY) {
    try {
      console.log("🤖 Analyzing QR text with OpenAI...");
      const url = "https://api.openai.com/v1/chat/completions";

      const res = await axios.post(
        url,
        {
          model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency on simple text
          messages: [
            {
              role: "system",
              content: prompt,
            },
            {
              role: "user",
              content: text,
            },
          ],
          temperature: 0.0,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          timeout: 15000,
        }
      );

      const responseText = res?.data?.choices?.[0]?.message?.content ?? "";
      console.log("📝 OpenAI QR analysis response:", responseText);

      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("✅ OpenAI QR analysis succeeded:", JSON.stringify(parsed, null, 2));

        // Convert arrays to single values for QRContactData compatibility
        const result: QRContactData = {
          firstName: parsed.firstName || '',
          lastName: parsed.lastName || '',
          company: parsed.company || '',
          position: parsed.position || '',
          email: Array.isArray(parsed.emails) && parsed.emails.length > 0
            ? parsed.emails[0]
            : (parsed.email || ''),
          phoneNumber: Array.isArray(parsed.phoneNumbers) && parsed.phoneNumbers.length > 0
            ? parsed.phoneNumbers[0]
            : (parsed.phoneNumber || ''),
          website: parsed.website || '',
          address: parsed.address || '',
          city: parsed.city || '',
          zipcode: parsed.zipcode || '',
          country: parsed.country || '',
        };

        return result;
      }
    } catch (err) {
      console.warn("⚠️ OpenAI QR analysis failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback to Gemini
  if (GEMINI_API_KEY) {
    try {
      console.log("🤖 Analyzing QR text with Gemini (fallback)...");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

      const res = await axios.post(
        url,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt + text,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.0, maxOutputTokens: 1024 },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      );

      const responseText = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("✅ Gemini QR analysis succeeded (fallback)");

        // Convert arrays to single values for QRContactData compatibility
        const result: QRContactData = {
          firstName: parsed.firstName || '',
          lastName: parsed.lastName || '',
          company: parsed.company || '',
          position: parsed.position || '',
          email: Array.isArray(parsed.emails) && parsed.emails.length > 0
            ? parsed.emails[0]
            : (parsed.email || ''),
          phoneNumber: Array.isArray(parsed.phoneNumbers) && parsed.phoneNumbers.length > 0
            ? parsed.phoneNumbers[0]
            : (parsed.phoneNumber || ''),
          website: parsed.website || '',
          address: parsed.address || '',
          city: parsed.city || '',
          zipcode: parsed.zipcode || '',
          country: parsed.country || '',
        };

        return result;
      }
    } catch (err) {
      console.warn("⚠️ Gemini QR analysis failed:", err instanceof Error ? err.message : String(err));
    }
  }

  console.warn("⚠️ AI analysis returned no data, falling back to regex");
  return {};
};

/**
 * Extracts contact info from plain text
 * Uses AI for complex formats, falls back to regex for simple cases
 */
const parsePlainText = async (text: string): Promise<QRContactData> => {
  // For complex text (pipe-delimited or multi-line with lots of data), use AI
  const isComplexText = text.includes('|') ||
                        (text.split('\n').length > 3) ||
                        (text.length > 100);

  if (isComplexText) {
    console.log("📄 Complex plain text detected, using AI analysis...");
    const aiResult = await analyzeQRTextWithAI(text);

    // If AI returned useful data, use it
    const hasAIData = aiResult.firstName || aiResult.lastName || aiResult.company ||
                      aiResult.email || aiResult.phoneNumber || aiResult.address;

    if (hasAIData) {
      // Extract unique code separately (AI might miss it)
      const uniqueCode = extractUniqueCode(text);
      if (uniqueCode) {
        aiResult.uniqueCode = uniqueCode;
        console.log(`📌 Extracted unique code from plain text: ${uniqueCode}`);
      }
      return aiResult;
    }

    console.log("⚠️ AI returned no useful data, falling back to regex parsing");
  }

  // Fallback to regex-based parsing for simple text or when AI fails
  const contactData: QRContactData = {};

  // Extract all emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  if (emails && emails.length > 0) {
    contactData.email = emails[0];
  }

  // Extract all phone numbers
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{0,4}/g;
  const phones = text.match(phoneRegex);
  if (phones) {
    // Filter valid phone numbers (at least 7 digits)
    const validPhones = phones.filter(p => {
      const digits = p.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    });
    if (validPhones.length > 0) {
      contactData.phoneNumber = validPhones[0].trim();
    }
  }

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
          confidence: 1.0
        },
      };
    }

    // Check if it's a mailto: link
    if (trimmedText.toLowerCase().startsWith('mailto:')) {
      console.log("📧 Detected mailto link in QR code");
      const rawContactData = parseMailtoLink(trimmedText);
      const entryCode = rawContactData.uniqueCode || '';
      const contactData = normalizeContactData(rawContactData);

      return {
        success: true,
        type: "mailto",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: contactData.email ? 1.0 : 0.5,
        },
      };
    }

    // Check if it's a tel: link
    if (trimmedText.toLowerCase().startsWith('tel:')) {
      console.log("📞 Detected tel link in QR code");
      const rawContactData = parseTelLink(trimmedText);
      const entryCode = rawContactData.uniqueCode || '';
      const contactData = normalizeContactData(rawContactData);

      return {
        success: true,
        type: "tel",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: contactData.phoneNumber ? 1.0 : 0.5,
        },
      };
    }

    // Check if it's a URL
    if (isURL(trimmedText)) {
      console.log("🌐 Detected URL in QR code, scraping webpage...");
      const rawContactData = await scrapeWebpage(trimmedText);
      const entryCode = rawContactData.uniqueCode || '';
      const contactData = normalizeContactData(rawContactData);

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

      return {
        success: true,
        type: "url",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: parseFloat(confidence.toFixed(2)),
        },
      };
    }

    // Check if it's a vCard
    if (isVCard(trimmedText)) {
      console.log("📇 Detected vCard in QR code, parsing...");
      const rawContactData = parseVCard(trimmedText);
      const entryCode = rawContactData.uniqueCode || '';
      const contactData = normalizeContactData(rawContactData);

      // Calculate confidence based on fields found
      const fieldCount = Object.values(contactData).filter(
        (v) => v && v.length > 0
      ).length;
      const confidence = Math.min(fieldCount / 5, 1);

      return {
        success: true,
        type: "vcard",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: parseFloat(confidence.toFixed(2)),
        },
      };
    }

    // Treat as plain text
    console.log("📄 Detected plain text in QR code, extracting info...");
    const rawContactData = await parsePlainText(trimmedText);
    const entryCode = rawContactData.uniqueCode || '';
    const contactData = normalizeContactData(rawContactData);

    // Calculate confidence
    const fieldCount = Object.values(contactData).filter(
      (v) => v && v.length > 0
    ).length;
    const confidence = fieldCount > 0 ? Math.min(fieldCount / 3, 1) : 0.3;

    return {
      success: true,
      type: "plaintext",
      data: {
        details: contactData,
        entryCode,
        rawData: trimmedText,
        confidence: parseFloat(confidence.toFixed(2)),
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
