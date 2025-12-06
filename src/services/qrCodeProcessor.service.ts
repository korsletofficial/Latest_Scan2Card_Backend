// import VCard from "vcard-parser";
// import puppeteerCore from "puppeteer-core";
// import puppeteer from "puppeteer";
// import chromium from "@sparticuz/chromium";
// // Uncomment and configure if you want LLM fallback
// // import OpenAI from "openai";

// // Detect environment - use serverless Chromium for production (AWS App Runner, Lambda, etc.)
// const isProduction = process.env.NODE_ENV === 'production' || process.env.USE_SERVERLESS_CHROMIUM === 'true';

// // Interface for extracted contact data
// export interface QRContactData {
//   title?: string; // Mr., Ms., Dr., etc.
//   firstName?: string;
//   lastName?: string;
//   company?: string;
//   position?: string;
//   department?: string; // Department within company
//   email?: string;
//   phoneNumber?: string;
//   mobile?: string; // Mobile phone (separate from phoneNumber)
//   fax?: string; // Fax number
//   website?: string;
//   address?: string;
//   streetName?: string; // Street address (alias for address)
//   zipCode?: string; // Postal code
//   city?: string;
//   country?: string;
//   notes?: string;
//   uniqueCode?: string; // Optional entry/unique code (9-15 chars)
// }

// /**
//  * Normalizes contact data to ensure all required fields are present with empty strings
//  */
// const normalizeContactData = (data: QRContactData): QRContactData => {
//   const normalized = {
//     firstName: data.firstName || '',
//     lastName: data.lastName || '',
//     company: data.company || '',
//     position: data.position || '',
//     email: data.email || '',
//     phoneNumber: data.phoneNumber || '',
//     website: data.website || '',
//     address: data.address || '',
//     city: data.city || '',
//     country: data.country || '',
//     ...data, // Preserve other fields like title, department, etc.
//   };

//   // Remove notes and uniqueCode from the response
//   // (uniqueCode is already passed separately as entryCode)
//   delete normalized.notes;
//   delete normalized.uniqueCode;

//   return normalized;
// };

// // Interface for QR processing result
// export interface QRProcessResult {
//   success: boolean;
//   type: "url" | "vcard" | "plaintext" | "entry_code" | "mailto" | "tel";
//   data?: {
//     details?: QRContactData;
//     entryCode?: string;
//     rawData: string;
//     confidence: number;
//     rating?: number; // Quality score (1-5)
//   };
//   error?: string;
// }

// /**
//  * Detects if text is a URL
//  */
// const isURL = (text: string): boolean => {
//   try {
//     const url = new URL(text);
//     return url.protocol === "http:" || url.protocol === "https:";
//   } catch {
//     return false;
//   }
// };

// /**
//  * Detects if text is a vCard
//  */
// const isVCard = (text: string): boolean => {
//   return text.trim().startsWith("BEGIN:VCARD") && text.includes("END:VCARD");
// };

// /**
//  * Detects if text is just an entry code (short alphanumeric code)
//  * Entry codes are typically short (3-30 chars), alphanumeric, and don't contain contact info
//  */
// const isEntryCode = (text: string): boolean => {
//   const trimmed = text.trim();

//   // Must be between 3 and 30 characters
//   if (trimmed.length < 3 || trimmed.length > 30) {
//     return false;
//   }

//   // Should not contain spaces, newlines, or special characters except hyphen/underscore
//   if (!/^[A-Za-z0-9\-_]+$/.test(trimmed)) {
//     return false;
//   }

//   // Should not look like a URL, email, or phone number
//   if (trimmed.includes('.') || trimmed.includes('@') || trimmed.includes('/')) {
//     return false;
//   }

//   // If it matches these criteria, it's likely an entry code
//   return true;
// };

// /**
//  * Validates if text is a valid name (filters out common non-name terms)
//  */
// const isValidName = (text: string): boolean => {
//   if (!text || text.length < 2 || text.length > 100) {
//     return false;
//   }

//   // Pattern: alphabetic characters with optional spaces, hyphens, apostrophes
//   const namePattern = /^[A-Za-z]+([\s\-'][A-Za-z]+)*$/;
//   if (!namePattern.test(text)) {
//     return false;
//   }

//   // Filter out common non-name terms
//   const invalidTerms = /(download|phone|email|address|website|contact|card|call|directions|fax|mobile|office|home)/i;
//   if (invalidTerms.test(text)) {
//     return false;
//   }

//   return true;
// };

// /**
//  * Validates if text is a valid company name
//  */
// const isValidCompany = (text: string): boolean => {
//   if (!text || text.length < 2 || text.length > 100) {
//     return false;
//   }

//   // Should not contain email addresses
//   if (text.includes('@')) {
//     return false;
//   }

//   // Should not start with a phone number
//   if (/^\+?\d/.test(text)) {
//     return false;
//   }

//   // Filter out job titles that might be mistaken for company names
//   const jobTitles = /(director|manager|ceo|cto|cfo|engineer|developer|designer|download|phone|email)/i;
//   if (jobTitles.test(text)) {
//     return false;
//   }

//   return true;
// };

// /**
//  * Validates if text is a valid position/job title
//  */
// const isValidPosition = (text: string): boolean => {
//   if (!text || text.length < 2 || text.length > 100) {
//     return false;
//   }

//   // Common position keywords
//   const positionKeywords = [
//     'manager', 'director', 'engineer', 'developer', 'designer', 'analyst',
//     'specialist', 'coordinator', 'officer', 'executive', 'president',
//     'vice', 'assistant', 'associate', 'senior', 'junior', 'lead',
//     'head', 'chief', 'ceo', 'cto', 'cfo', 'coo', 'consultant'
//   ];

//   const textLower = text.toLowerCase();
//   return positionKeywords.some(keyword => textLower.includes(keyword));
// };

// /**
//  * Calculate rating based on data completeness (1-5 scale)
//  */
// const calculateRating = (contactData: QRContactData): number => {
//   const email = contactData.email;
//   const phone = contactData.phoneNumber || contactData.mobile;
//   const name = contactData.firstName || contactData.lastName;
//   const company = contactData.company;
//   const position = contactData.position;

//   // Best: has both contact methods + name + company
//   if (email && phone && name && company) return 5;

//   // Great: has both contact methods + name
//   if (email && phone && name) return 4;

//   // Good: has one contact method + name + company
//   if ((email || phone) && name && company) return 4;

//   // Decent: has one contact method + name
//   if ((email || phone) && name) return 3;

//   // Minimal: has at least one contact method
//   if (email || phone) return 3;

//   // Poor: missing critical contact info
//   if (name || company) return 2;

//   return 1;
// };

// /**
//  * Extracts email from text using regex
//  */
// const extractEmail = (text: string): string | undefined => {
//   const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
//   const match = text.match(emailRegex);
//   return match ? match[0] : undefined;
// };

// /**
//  * Extracts phone number from text using regex
//  */
// const extractPhone = (text: string): string | undefined => {
//   // Multiple phone regex patterns to catch various formats
//   const phonePatterns = [
//     /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,5}/, // US/Canada format with extensions
//     /(\+?\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4})/, // International format
//     /\+?\d{10,15}/, // Simple international
//     /(\(\d{3}\)\s?\d{3}[-.\s]\d{4})/, // (123) 456-7890
//     /(\d{3}[-.\s]\d{3}[-.\s]\d{4})/, // 123-456-7890 or 123 456 7890
//   ];

//   for (const pattern of phonePatterns) {
//     const match = text.match(pattern);
//     if (match) {
//       // Clean up the phone number
//       const cleaned = match[0].replace(/[^\d+\-\s()]/g, '').trim();
//       // Validate: should have at least 7 digits, at most 15
//       const digitCount = cleaned.replace(/[^\d]/g, '').length;
//       if (digitCount >= 7 && digitCount <= 15) {
//         return cleaned;
//       }
//     }
//   }
//   return undefined;
// };

// /**
//  * Extracts unique code (9-15 alphanumeric characters) from text
//  * Looks for patterns like: code=ABC123, UniqueCode: ABC123, NOTE:UniqueCode=ABC123
//  */
// const extractUniqueCode = (text: string): string | undefined => {
//   // Pattern 1: Key-value pairs (code=, uniqueCode=, unique_code=, entryCode=, entry_code=)
//   const keyValuePatterns = [
//     /(?:code|uniquecode|unique_code|entrycode|entry_code|uniqueid|unique_id)\s*[=:]\s*([A-Za-z0-9]{9,15})/i,
//     /NOTE\s*:\s*(?:code|uniquecode|unique_code)\s*[=:]\s*([A-Za-z0-9]{9,15})/i,
//   ];

//   for (const pattern of keyValuePatterns) {
//     const match = text.match(pattern);
//     if (match && match[1]) {
//       return match[1];
//     }
//   }

//   // Pattern 2: Standalone alphanumeric code (9-15 chars) on its own line or after label
//   const standalonePattern = /\b([A-Za-z0-9]{9,15})\b/g;
//   const matches = text.match(standalonePattern);

//   if (matches) {
//     // Filter out common non-code patterns (phone numbers, emails, URLs)
//     for (const match of matches) {
//       // Skip if it looks like phone number (too many digits)
//       const digitCount = match.replace(/[^\d]/g, '').length;
//       if (digitCount > 10) continue;

//       // Skip if it's all numbers (likely phone/zip)
//       if (/^\d+$/.test(match)) continue;

//       // Skip if it's part of email or URL context
//       const context = text.substring(Math.max(0, text.indexOf(match) - 10), text.indexOf(match) + match.length + 10);
//       if (context.includes('@') || context.includes('http') || context.includes('www')) continue;

//       // This looks like a valid unique code
//       return match;
//     }
//   }

//   return undefined;
// };

// /**
//  * Parses mailto: link and extracts contact information
//  */
// const parseMailtoLink = (mailtoLink: string): QRContactData => {
//   const contactData: QRContactData = {};

//   try {
//     // Remove 'mailto:' prefix
//     const emailPart = mailtoLink.replace('mailto:', '');
//     const [email, queryString] = emailPart.split('?');

//     contactData.email = decodeURIComponent(email.trim());

//     // Parse query parameters if present
//     if (queryString) {
//       const params = new URLSearchParams(queryString);

//       // Extract subject and body as notes
//       const subject = params.get('subject');
//       const body = params.get('body');

//       if (subject || body) {
//         const notes = [];
//         if (subject) notes.push(`Subject: ${subject}`);
//         if (body) notes.push(`Body: ${body}`);
//         contactData.notes = notes.join(' | ');
//       }
//     }
//   } catch (error: any) {
//     console.error('Error parsing mailto link:', error.message);
//   }

//   return contactData;
// };

// /**
//  * Parses tel: link and extracts phone number
//  */
// const parseTelLink = (telLink: string): QRContactData => {
//   const contactData: QRContactData = {};

//   try {
//     // Remove 'tel:' prefix and clean up
//     const phoneNumber = telLink
//       .replace('tel:', '')
//       .replace(/[^\d+\-\s()]/g, '')
//       .trim();

//     contactData.phoneNumber = phoneNumber;
//     contactData.mobile = phoneNumber; // Also set as mobile
//   } catch (error: any) {
//     console.error('Error parsing tel link:', error.message);
//   }

//   return contactData;
// };

// /**
//  * Delay utility for retry logic
//  */
// const delay = (ms: number): Promise<void> => {
//   return new Promise(resolve => setTimeout(resolve, ms));
// };

// /**
//  * Scrapes contact information from a webpage
//  */
// const fieldMap: Record<string, keyof QRContactData> = {
//   // Common alternates for each field
//   firstname: "firstName",
//   given_name: "firstName",
//   lastname: "lastName",
//   surname: "lastName",
//   org: "company",
//   organization: "company",
//   company: "company",
//   job_title: "position",
//   title: "position",
//   email: "email",
//   mail: "email",
//   phone: "phoneNumber",
//   tel: "phoneNumber",
//   mobile: "phoneNumber",
//   website: "website",
//   url: "website",
//   address: "address",
//   street: "address",
//   city: "city",
//   locality: "city",
//   country: "country",
//   country_name: "country",
//   notes: "notes",
//   note: "notes",
// };

// const parseQRCodeChimpPayload = (rawScript: string, fallbackUrl: string): QRContactData | null => {
//   if (!rawScript) {
//     return null;
//   }

//   try {
//     const payload = JSON.parse(rawScript);
//     const content = Array.isArray(payload?.content) ? payload.content : [];
//     const contactData: QRContactData = {};

//     const ensureWebsite = (): string | undefined => {
//       if (payload?.short_url) {
//         const shortUrl: string = payload.short_url;
//         if (shortUrl.startsWith('http')) {
//           return shortUrl;
//         }
//         return `https://linko.page/${shortUrl}`;
//       }
//       return fallbackUrl;
//     };

//     const setIfEmpty = (key: keyof QRContactData, value?: string): void => {
//       if (!value) return;
//       if (!contactData[key]) {
//         contactData[key] = value;
//       }
//     };

//     const profileComponent = content.find((item: any) => item?.component === 'profile');
//     if (profileComponent?.name) {
//       const nameParts = String(profileComponent.name).trim().split(/\s+/);
//       setIfEmpty('firstName', nameParts[0]);
//       if (nameParts.length > 1) {
//         setIfEmpty('lastName', nameParts.slice(1).join(' '));
//       }
//     }

//     setIfEmpty('company', profileComponent?.company);
//     setIfEmpty('position', profileComponent?.desc);

//     if (Array.isArray(profileComponent?.contact_shortcuts)) {
//       for (const shortcut of profileComponent.contact_shortcuts) {
//         if (shortcut?.type === 'mobile') {
//           setIfEmpty('phoneNumber', shortcut.value);
//         }
//         if (shortcut?.type === 'email') {
//           setIfEmpty('email', shortcut.value);
//         }
//       }
//     }

//     const contactComponent = content.find((item: any) => item?.component === 'contact');
//     if (Array.isArray(contactComponent?.contact_infos)) {
//       for (const info of contactComponent.contact_infos) {
//         if (info?.type === 'email') {
//           setIfEmpty('email', info.email);
//         }
//         if (info?.type === 'number' || info?.type === 'mobile') {
//           setIfEmpty('phoneNumber', info.number ?? info.value);
//         }
//         if (info?.type === 'address') {
//           const street = info.street ?? info.address;
//           const city = info.city ?? info.town;
//           const country = info.country;
//           setIfEmpty('address', street);
//           setIfEmpty('city', city);
//           setIfEmpty('country', country);
//         }
//       }
//     }

//     setIfEmpty('website', ensureWebsite());

//     const hasData = Object.values(contactData).some((value) => Boolean(value));
//     return hasData ? contactData : null;
//   } catch (error: any) {
//     console.error('Failed to parse embedded QR template payload:', error?.message || error);
//     return null;
//   }
// };

// const scrapeWebpage = async (url: string, retryAttempts: number = 3): Promise<QRContactData> => {
//   let lastError: Error | null = null;

//   // Retry logic with exponential backoff
//   for (let attempt = 0; attempt < retryAttempts; attempt++) {
//     try {
//       console.log(`🔍 Attempt ${attempt + 1}/${retryAttempts} - Scraping: ${url}`);

//       // Skip axios/cheerio and go straight to Puppeteer for dynamic content
//       // This ensures we can extract data from JavaScript-rendered pages
//       console.log("🌐 Using Puppeteer for dynamic content extraction");

//       // Use different Puppeteer config based on environment
//       let browser;
//       if (isProduction) {
//         // Production: Use puppeteer-core with serverless chromium
//         const executablePath = await chromium.executablePath();
//         const chromiumArgs = [
//           ...chromium.args,
//           '--no-sandbox',
//           '--disable-setuid-sandbox',
//           '--disable-dev-shm-usage',
//           '--disable-web-security',
//           '--disable-features=IsolateOrigins,site-per-process',
//         ];
//         console.log(`🔧 Using serverless Chromium for production (path: ${executablePath})`);
//         browser = await puppeteerCore.launch({
//           args: chromiumArgs,
//           defaultViewport: { width: 1920, height: 1080 },
//           executablePath,
//           headless: (chromium as any).headless ?? true,
//         });
//       } else {
//         // Local: Use regular puppeteer with bundled Chrome
//         console.log("🔧 Using local Puppeteer for development");
//         browser = await puppeteer.launch({
//           headless: true,
//           args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-dev-shm-usage'],
//         });
//       }

//       const page = await browser.newPage();
//       await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });
//       await page.setViewport({ width: 1280, height: 720 });

//       // Set user agent to avoid bot detection
//       await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

//       console.log(`📄 Navigating to ${url}...`);
//       await page.goto(url, {
//         waitUntil: 'networkidle0',
//         timeout: 30000
//       });

//       // Wait for dynamic content to load
//       await new Promise(resolve => setTimeout(resolve, 3000));

//       console.log("📊 Extracting data from rendered page...");

//       // Extract all data from the page
//       // @ts-ignore - This code runs in browser context, not Node.js
//       const extractedData = await page.evaluate(() => {
//         // Helper function to extract text from selectors
//         const getText = (selectors: string[]): string => {
//           for (const selector of selectors) {
//             // @ts-ignore
//             const elements = document.querySelectorAll(selector);
//             for (const el of elements) {
//               const text = el.textContent?.trim();
//               if (text && text.length > 0) return text;
//             }
//           }
//           return '';
//         };

//         // Helper to get meta content
//         const getMeta = (names: string[]): string => {
//           for (const name of names) {
//             // @ts-ignore
//             const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
//             if (meta) {
//               const content = meta.getAttribute('content');
//               if (content) return content.trim();
//             }
//           }
//           return '';
//         };

//         // Extract data using various selectors and patterns
//         const data: any = {};

//         // Get all visible text for fallback parsing
//         // @ts-ignore
//         data.fullText = document.body.innerText;

//         // Try structured data (JSON-LD)
//         // @ts-ignore
//         const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
//         for (const script of jsonLdScripts) {
//           try {
//             const jsonData = JSON.parse(script.textContent || '');
//             if (jsonData['@type'] === 'Person') {
//               data.jsonLd = jsonData;
//             }
//           } catch (e) {
//             // Ignore parse errors
//           }
//         }

//         // Extract from meta tags
//         data.metaTitle = getMeta(['title', 'og:title', 'twitter:title']);
//         data.metaDescription = getMeta(['description', 'og:description', 'twitter:description']);

//         // Extract from common selectors
//         data.name = getText([
//           '[itemprop="name"]',
//           '.name', '.full-name', '.person-name',
//           'h1.name', 'h2.name', 'h1', 'h2'
//         ]);

//         data.email = getText([
//           '[itemprop="email"]',
//           'a[href^="mailto:"]',
//           '.email', '.e-mail',
//           '[data-email]'
//         ]);

//         // Extract email from href if present
//         // @ts-ignore
//         const emailLink = document.querySelector('a[href^="mailto:"]');
//         if (emailLink && !data.email) {
//           const href = emailLink.getAttribute('href');
//           if (href) {
//             data.email = href.replace('mailto:', '').split('?')[0];
//           }
//         }

//         data.phone = getText([
//           '[itemprop="telephone"]',
//           'a[href^="tel:"]',
//           '.phone', '.tel', '.telephone', '.mobile',
//           '[data-phone]'
//         ]);

//         // Extract phone from href if present
//         // @ts-ignore
//         const phoneLink = document.querySelector('a[href^="tel:"]');
//         if (phoneLink && !data.phone) {
//           const href = phoneLink.getAttribute('href');
//           if (href) {
//             data.phone = href.replace('tel:', '').trim();
//           }
//         }

//         data.company = getText([
//           '[itemprop="worksFor"]',
//           '[itemprop="organization"]',
//           '.company', '.organization', '.org'
//         ]);

//         data.position = getText([
//           '[itemprop="jobTitle"]',
//           '.title', '.job-title', '.position', '.role'
//         ]);

//         data.address = getText([
//           '[itemprop="address"]',
//           '[itemprop="streetAddress"]',
//           '.address', '.street-address'
//         ]);

//         data.city = getText([
//           '[itemprop="addressLocality"]',
//           '.city', '.locality'
//         ]);

//         data.country = getText([
//           '[itemprop="addressCountry"]',
//           '.country'
//         ]);

//         try {
//           // Attempt to capture embedded QR template payload
//           // @ts-ignore
//           const scripts = Array.from(document.scripts || []) as Array<any>;
//           for (const script of scripts) {
//             const text = script.textContent || '';
//             if (text.includes('__savedQrCodeParams')) {
//               const match = text.match(/__savedQrCodeParams\s*=\s*(\{[\s\S]*?\});?/);
//               if (match && match[1]) {
//                 data.qrCodeChimpRaw = match[1];
//                 break;
//               }
//             }
//           }
//         } catch (err) {
//           // Ignore script extraction errors
//         }

//         return data;
//       });

//       await browser.close();

//       console.log("✅ Data extraction complete, processing...");
//       console.log("📦 Extracted data:", JSON.stringify(extractedData, null, 2));

//       // Process the extracted data
//       const contactData: QRContactData = { website: url };
//       const mergeIfMissing = (source?: QRContactData | null) => {
//         if (!source) return;
//         (Object.keys(source) as (keyof QRContactData)[]).forEach((key) => {
//           const value = source[key];
//           if (value && !contactData[key]) {
//             contactData[key] = value;
//           }
//         });
//       };

//       // Process JSON-LD if available
//       if (extractedData.jsonLd) {
//         const jld = extractedData.jsonLd;
//         if (jld.name) {
//           const nameParts = jld.name.split(' ');
//           contactData.firstName = nameParts[0];
//           if (nameParts.length > 1) {
//             contactData.lastName = nameParts.slice(1).join(' ');
//           }
//         }
//         if (jld.givenName) contactData.firstName = jld.givenName;
//         if (jld.familyName) contactData.lastName = jld.familyName;
//         if (jld.email) contactData.email = jld.email;
//         if (jld.telephone) contactData.phoneNumber = jld.telephone;
//         if (jld.jobTitle) contactData.position = jld.jobTitle;
//         if (jld.worksFor?.name) contactData.company = jld.worksFor.name;
//       }

//       // Process extracted fields
//       if (extractedData.name && !contactData.firstName) {
//         const nameParts = extractedData.name.split(' ');
//         contactData.firstName = nameParts[0];
//         if (nameParts.length > 1) {
//           contactData.lastName = nameParts.slice(1).join(' ');
//         }
//       }

//       if (extractedData.email) {
//         contactData.email = extractEmail(extractedData.email) || extractedData.email;
//       }

//       if (extractedData.phone) {
//         contactData.phoneNumber = extractPhone(extractedData.phone) || extractedData.phone;
//       }

//       if (extractedData.company) {
//         contactData.company = extractedData.company;
//       }

//       if (extractedData.position) {
//         contactData.position = extractedData.position;
//       }

//       if (extractedData.address) {
//         contactData.address = extractedData.address;
//       }

//       if (extractedData.city) {
//         contactData.city = extractedData.city;
//       }

//       if (extractedData.country) {
//         contactData.country = extractedData.country;
//       }

//       if (extractedData.qrCodeChimpRaw) {
//         console.log('🧩 Embedded QR template payload detected, parsing as fallback...');
//         mergeIfMissing(parseQRCodeChimpPayload(extractedData.qrCodeChimpRaw, url));
//       }

//       const normalizedPageText = extractedData.fullText?.toLowerCase();
//       if (normalizedPageText && normalizedPageText.includes('just a moment') && normalizedPageText.includes('checking if the site connection is secure')) {
//         console.warn('⚠️ Possible bot challenge detected on page content.');
//       }

//       // Fallback: Parse from full text if we don't have enough data
//       if (!contactData.email && !contactData.phoneNumber && extractedData.fullText) {
//         console.log("🔄 Applying fallback text extraction...");
//         const lines = extractedData.fullText.split("\n").filter((line: string) => line.trim());

//         // Extract email from text
//         contactData.email = extractEmail(extractedData.fullText);

//         // Extract phone from text
//         contactData.phoneNumber = extractPhone(extractedData.fullText);

//         // Try to extract name from first meaningful line
//         if (!contactData.firstName && lines.length > 0) {
//           for (const line of lines) {
//             const trimmedLine = line.trim();
//             if (
//               trimmedLine.length >= 3 &&
//               trimmedLine.length < 50 &&
//               !trimmedLine.includes("@") &&
//               !trimmedLine.match(/\d{3}/) &&
//               isValidName(trimmedLine)
//             ) {
//               const nameParts = trimmedLine.split(" ");
//               if (nameParts.length >= 2) {
//                 contactData.firstName = nameParts[0];
//                 contactData.lastName = nameParts.slice(1).join(" ");
//               } else {
//                 contactData.firstName = trimmedLine;
//               }
//               break;
//             }
//           }
//         }

//         // Try to extract company
//         if (!contactData.company && lines.length > 1) {
//           for (let i = 1; i < Math.min(lines.length, 5); i++) {
//             const line = lines[i].trim();
//             if (line.length > 2 && line.length < 100 && isValidCompany(line)) {
//               contactData.company = line;
//               break;
//             }
//           }
//         }

//         // Try to extract position
//         if (!contactData.position && lines.length > 1) {
//           for (let i = 1; i < Math.min(lines.length, 5); i++) {
//             const line = lines[i].trim();
//             if (line.length > 2 && line.length < 100 && isValidPosition(line)) {
//               contactData.position = line;
//               break;
//             }
//           }
//         }
//       }

//       console.log("✨ Final contact data:", JSON.stringify(contactData, null, 2));
//       return contactData;

//     } catch (error: any) {
//       lastError = error instanceof Error ? error : new Error('Unknown error');
//       console.error(`❌ Error on attempt ${attempt + 1}:`, error.message);
//       console.error(`Stack trace:`, error.stack);

//       // If this isn't the last attempt, wait with exponential backoff
//       if (attempt < retryAttempts - 1) {
//         const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
//         console.log(`⏳ Retry attempt ${attempt + 2}/${retryAttempts} after ${delayMs}ms...`);
//         await delay(delayMs);
//       }
//     }
//   }

//   // All retries failed
//   console.error("❌ Error scraping webpage after", retryAttempts, "attempts:", lastError?.message);
//   console.error("Full error:", lastError);
//   // Return at least the URL
//   return { website: url };
// };

// /**
//  * Parses vCard data
//  */
// const parseVCard = (vcardText: string): QRContactData => {
//   try {
//     const parsed = VCard.parse(vcardText);
//     const contactData: QRContactData = {};

//     if (parsed && parsed.fn) {
//       // Parse full name
//       const fullName = parsed.fn[0].value;
//       const nameParts = fullName.split(" ");
//       if (nameParts.length >= 2) {
//         contactData.firstName = nameParts[0];
//         contactData.lastName = nameParts.slice(1).join(" ");
//       } else {
//         contactData.firstName = fullName;
//       }
//     }

//     // Parse structured name if available
//     if (parsed && parsed.n && parsed.n[0]) {
//       const n = parsed.n[0].value;
//       if (n.length >= 2) {
//         contactData.lastName = n[0];
//         contactData.firstName = n[1];
//       }
//     }

//     // Parse organization
//     if (parsed && parsed.org) {
//       contactData.company = parsed.org[0].value;
//     }

//     // Parse title/position
//     if (parsed && parsed.title) {
//       contactData.position = parsed.title[0].value;
//     }

//     // Parse email
//     if (parsed && parsed.email) {
//       contactData.email = parsed.email[0].value;
//     }

//     // Parse phone
//     if (parsed && parsed.tel) {
//       contactData.phoneNumber = parsed.tel[0].value;
//     }

//     // Parse URL/website
//     if (parsed && parsed.url) {
//       contactData.website = parsed.url[0].value;
//     }

//     // Parse address
//     if (parsed && parsed.adr && parsed.adr[0]) {
//       const addr = parsed.adr[0].value;
//       if (Array.isArray(addr)) {
//         // addr format: [po-box, extended, street, city, region, postal, country]
//         if (addr[2]) contactData.address = addr[2]; // street
//         if (addr[3]) contactData.city = addr[3]; // city
//         if (addr[6]) contactData.country = addr[6]; // country
//       }
//     }

//     // Parse NOTE field for unique code (optional)
//     // Example: NOTE:UniqueCode=ABC123XYZ or NOTE:ABC123XYZ456
//     if (parsed && parsed.note && parsed.note[0]) {
//       const noteValue = parsed.note[0].value;
//       const uniqueCode = extractUniqueCode(noteValue);
//       if (uniqueCode) {
//         contactData.uniqueCode = uniqueCode;
//         console.log(`📌 Extracted unique code from vCard NOTE: ${uniqueCode}`);
//       }
//     }

//     // Also try extracting from the raw vCard text (in case NOTE isn't parsed correctly)
//     if (!contactData.uniqueCode) {
//       const uniqueCode = extractUniqueCode(vcardText);
//       if (uniqueCode) {
//         contactData.uniqueCode = uniqueCode;
//         console.log(`📌 Extracted unique code from vCard raw text: ${uniqueCode}`);
//       }
//     }

//     return contactData;
//   } catch (error: any) {
//     console.error("Error parsing vCard:", error.message);
//     throw new Error("Failed to parse vCard data");
//   }
// };

// /**
//  * Extracts contact info from plain text
//  */
// const parsePlainText = (text: string): QRContactData => {
//   const contactData: QRContactData = {};

//   // Extract email
//   contactData.email = extractEmail(text);

//   // Extract phone
//   contactData.phoneNumber = extractPhone(text);

//   // Extract unique code (optional)
//   const uniqueCode = extractUniqueCode(text);
//   if (uniqueCode) {
//     contactData.uniqueCode = uniqueCode;
//     console.log(`📌 Extracted unique code from plain text: ${uniqueCode}`);
//   }

//   // Try to extract name from first line
//   const lines = text.split("\n").filter((line) => line.trim());
//   if (lines.length > 0) {
//     const firstLine = lines[0].trim();
//     // If first line looks like a name (less than 50 chars, no email/phone)
//     if (
//       firstLine.length < 50 &&
//       !firstLine.includes("@") &&
//       !firstLine.match(/\d{3}/)
//     ) {
//       const nameParts = firstLine.split(" ");
//       if (nameParts.length >= 2) {
//         contactData.firstName = nameParts[0];
//         contactData.lastName = nameParts.slice(1).join(" ");
//       } else {
//         contactData.firstName = firstLine;
//       }
//     }
//   }

//   // Do not include notes in the response

//   return contactData;
// };

// /**
//  * Processes QR code text and extracts contact information
//  */
// export const processQRCode = async (
//   qrText: string
// ): Promise<QRProcessResult> => {
//   try {
//     if (!qrText || qrText.trim().length === 0) {
//       return {
//         success: false,
//         type: "plaintext",
//         error: "QR code text is empty",
//       };
//     }

//     const trimmedText = qrText.trim();

//     // Check if it's an entry code (do this first as it's the simplest)
//     if (isEntryCode(trimmedText)) {
//       console.log("🎫 Detected entry code in QR code");
//       return {
//         success: true,
//         type: "entry_code",
//         data: {
//           entryCode: trimmedText,
//           rawData: trimmedText,
//           confidence: 1.0,
//           rating: 1,
//         },
//       };
//     }

//     // Check if it's a mailto: link
//     if (trimmedText.toLowerCase().startsWith('mailto:')) {
//       console.log("📧 Detected mailto link in QR code");
//       const rawContactData = parseMailtoLink(trimmedText);
//       const entryCode = rawContactData.uniqueCode || '';
//       const contactData = normalizeContactData(rawContactData);
//       const rating = calculateRating(contactData);

//       return {
//         success: true,
//         type: "mailto",
//         data: {
//           details: contactData,
//           entryCode,
//           rawData: trimmedText,
//           confidence: contactData.email ? 1.0 : 0.5,
//           rating,
//         },
//       };
//     }

//     // Check if it's a tel: link
//     if (trimmedText.toLowerCase().startsWith('tel:')) {
//       console.log("📞 Detected tel link in QR code");
//       const rawContactData = parseTelLink(trimmedText);
//       const entryCode = rawContactData.uniqueCode || '';
//       const contactData = normalizeContactData(rawContactData);
//       const rating = calculateRating(contactData);

//       return {
//         success: true,
//         type: "tel",
//         data: {
//           details: contactData,
//           entryCode,
//           rawData: trimmedText,
//           confidence: contactData.phoneNumber ? 1.0 : 0.5,
//           rating,
//         },
//       };
//     }

//     // Check if it's a URL
//     if (isURL(trimmedText)) {
//       console.log("🌐 Detected URL in QR code, scraping webpage...");
//       const rawContactData = await scrapeWebpage(trimmedText);
//       const entryCode = rawContactData.uniqueCode || '';
//       const contactData = normalizeContactData(rawContactData);

//       // Optionally: Use LLM to fill missing fields (uncomment and configure)
//       /*
//       if (Object.values(contactData).filter(Boolean).length < 6) {
//         const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
//         const prompt = `Extract contact info (firstName, lastName, company, position, email, phoneNumber, website, address, city, country) from this HTML or JSON. Return as JSON.`;
//         const llmResult = await openai.chat.completions.create({
//           model: "gpt-4-turbo",
//           messages: [
//             { role: "system", content: prompt },
//             { role: "user", content: response.data },
//           ],
//         });
//         try {
//           const llmJson = JSON.parse(llmResult.choices[0].message.content);
//           Object.assign(contactData, llmJson);
//         } catch {}
//       }
//       */

//       // Calculate confidence based on fields found
//       const fieldCount = Object.values(contactData).filter(
//         (v) => v && v.length > 0
//       ).length;
//       const confidence = Math.min(fieldCount / 10, 1); // Normalize to 0-1 (10 fields)
//       const rating = calculateRating(contactData);

//       return {
//         success: true,
//         type: "url",
//         data: {
//           details: contactData,
//           entryCode,
//           rawData: trimmedText,
//           confidence: parseFloat(confidence.toFixed(2)),
//           rating,
//         },
//       };
//     }

//     // Check if it's a vCard
//     if (isVCard(trimmedText)) {
//       console.log("📇 Detected vCard in QR code, parsing...");
//       const rawContactData = parseVCard(trimmedText);
//       const entryCode = rawContactData.uniqueCode || '';
//       const contactData = normalizeContactData(rawContactData);

//       // Calculate confidence based on fields found
//       const fieldCount = Object.values(contactData).filter(
//         (v) => v && v.length > 0
//       ).length;
//       const confidence = Math.min(fieldCount / 5, 1);
//       const rating = calculateRating(contactData);

//       return {
//         success: true,
//         type: "vcard",
//         data: {
//           details: contactData,
//           entryCode,
//           rawData: trimmedText,
//           confidence: parseFloat(confidence.toFixed(2)),
//           rating,
//         },
//       };
//     }

//     // Treat as plain text
//     console.log("📄 Detected plain text in QR code, extracting info...");
//     const rawContactData = parsePlainText(trimmedText);
//     const entryCode = rawContactData.uniqueCode || '';
//     const contactData = normalizeContactData(rawContactData);

//     // Calculate confidence
//     const fieldCount = Object.values(contactData).filter(
//       (v) => v && v.length > 0
//     ).length;
//     const confidence = fieldCount > 0 ? Math.min(fieldCount / 3, 1) : 0.3;
//     const rating = calculateRating(contactData);

//     return {
//       success: true,
//       type: "plaintext",
//       data: {
//         details: contactData,
//         entryCode,
//         rawData: trimmedText,
//         confidence: parseFloat(confidence.toFixed(2)),
//         rating,
//       },
//     };
//   } catch (error: any) {
//     console.error("❌ Error processing QR code:", error);
//     return {
//       success: false,
//       type: "plaintext",
//       error: error.message || "Failed to process QR code",
//     };
//   }
// };











import VCard from "vcard-parser";
import puppeteer, { type Browser } from "puppeteer";
import axios from "axios";
// Uncomment and configure if you want LLM fallback
// import OpenAI from "openai";

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

/**
 * Normalizes contact data to ensure all required fields are present with empty strings
 */
const normalizeContactData = (data: QRContactData): QRContactData => {
  const normalized = {
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    company: data.company || "",
    position: data.position || "",
    email: data.email || "",
    phoneNumber: data.phoneNumber || "",
    website: data.website || "",
    address: data.address || "",
    city: data.city || "",
    country: data.country || "",
    ...data, // Preserve other fields like title, department, etc.
  };

  // Remove notes and uniqueCode from the response
  // (uniqueCode is already passed separately as entryCode)
  delete (normalized as any).notes;
  delete (normalized as any).uniqueCode;

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
  if (trimmed.includes(".") || trimmed.includes("@") || trimmed.includes("/")) {
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
  const invalidTerms =
    /(download|phone|email|address|website|contact|card|call|directions|fax|mobile|office|home)/i;
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
  if (text.includes("@")) {
    return false;
  }

  // Should not start with a phone number
  if (/^\+?\d/.test(text)) {
    return false;
  }

  // Filter out job titles that might be mistaken for company names
  const jobTitles =
    /(director|manager|ceo|cto|cfo|engineer|developer|designer|download|phone|email)/i;
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
    "manager",
    "director",
    "engineer",
    "developer",
    "designer",
    "analyst",
    "specialist",
    "coordinator",
    "officer",
    "executive",
    "president",
    "vice",
    "assistant",
    "associate",
    "senior",
    "junior",
    "lead",
    "head",
    "chief",
    "ceo",
    "cto",
    "cfo",
    "coo",
    "consultant",
  ];

  const textLower = text.toLowerCase();
  return positionKeywords.some((keyword) => textLower.includes(keyword));
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
      const cleaned = match[0].replace(/[^\d+\-\s()]/g, "").trim();
      // Validate: should have at least 7 digits, at most 15
      const digitCount = cleaned.replace(/[^\d]/g, "").length;
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
      const digitCount = match.replace(/[^\d]/g, "").length;
      if (digitCount > 10) continue;

      // Skip if it's all numbers (likely phone/zip)
      if (/^\d+$/.test(match)) continue;

      // Skip if it's part of email or URL context
      const context = text.substring(
        Math.max(0, text.indexOf(match) - 10),
        text.indexOf(match) + match.length + 10
      );
      if (context.includes("@") || context.includes("http") || context.includes("www")) continue;

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
    const emailPart = mailtoLink.replace("mailto:", "");
    const [email, queryString] = emailPart.split("?");

    contactData.email = decodeURIComponent(email.trim());

    // Parse query parameters if present
    if (queryString) {
      const params = new URLSearchParams(queryString);

      // Extract subject and body as notes
      const subject = params.get("subject");
      const body = params.get("body");

      if (subject || body) {
        const notes = [];
        if (subject) notes.push(`Subject: ${subject}`);
        if (body) notes.push(`Body: ${body}`);
        contactData.notes = notes.join(" | ");
      }
    }
  } catch (error: any) {
    console.error("Error parsing mailto link:", error.message);
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
    const phoneNumber = telLink.replace("tel:", "").replace(/[^\d+\-\s()]/g, "").trim();

    contactData.phoneNumber = phoneNumber;
    contactData.mobile = phoneNumber; // Also set as mobile
  } catch (error: any) {
    console.error("Error parsing tel link:", error.message);
  }

  return contactData;
};

/**
 * Delay utility for retry logic
 */
const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const parseQRCodeChimpPayload = (
  rawScript: string,
  fallbackUrl: string
): QRContactData | null => {
  if (!rawScript) {
    return null;
  }

  try {
    const payload = JSON.parse(rawScript);
    const content = Array.isArray(payload?.content) ? payload.content : [];
    const contactData: QRContactData = {};

    const ensureWebsite = (): string | undefined => {
      if (payload?.short_url) {
        const shortUrl: string = payload.short_url;
        if (shortUrl.startsWith("http")) {
          return shortUrl;
        }
        return `https://linko.page/${shortUrl}`;
      }
      return fallbackUrl;
    };

    const setIfEmpty = (key: keyof QRContactData, value?: string): void => {
      if (!value) return;
      if (!contactData[key]) {
        contactData[key] = value;
      }
    };

    const profileComponent = content.find((item: any) => item?.component === "profile");
    if (profileComponent?.name) {
      const nameParts = String(profileComponent.name).trim().split(/\s+/);
      setIfEmpty("firstName", nameParts[0]);
      if (nameParts.length > 1) {
        setIfEmpty("lastName", nameParts.slice(1).join(" "));
      }
    }

    setIfEmpty("company", profileComponent?.company);
    setIfEmpty("position", profileComponent?.desc);

    if (Array.isArray(profileComponent?.contact_shortcuts)) {
      for (const shortcut of profileComponent.contact_shortcuts) {
        if (shortcut?.type === "mobile") {
          setIfEmpty("phoneNumber", shortcut.value);
        }
        if (shortcut?.type === "email") {
          setIfEmpty("email", shortcut.value);
        }
      }
    }

    const contactComponent = content.find((item: any) => item?.component === "contact");
    if (Array.isArray(contactComponent?.contact_infos)) {
      for (const info of contactComponent.contact_infos) {
        if (info?.type === "email") {
          setIfEmpty("email", info.email);
        }
        if (info?.type === "number" || info?.type === "mobile") {
          setIfEmpty("phoneNumber", info.number ?? info.value);
        }
        if (info?.type === "address") {
          const street = info.street ?? info.address;
          const city = info.city ?? info.town;
          const country = info.country;
          setIfEmpty("address", street);
          setIfEmpty("city", city);
          setIfEmpty("country", country);
        }
      }
    }

    setIfEmpty("website", ensureWebsite());

    const hasData = Object.values(contactData).some((value) => Boolean(value));
    return hasData ? contactData : null;
  } catch (error: any) {
    console.error(
      "Failed to parse embedded QR template payload:",
      error?.message || error
    );
    return null;
  }
};

/**
 * New: Attempt to fetch HTML directly and extract __savedQrCodeParams block.
 * Returns raw JSON string if found, null otherwise.
 */
const fetchHtmlAndExtractJson = async (
  url: string
): Promise<{ rawScript: string | null; htmlText: string | null }> => {
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 15000,
    });

    const html = res.data as string;
    const match = html.match(/__savedQrCodeParams\s*=\s*(\{[\s\S]*?\});?/);
    if (match && match[1]) {
      return { rawScript: match[1], htmlText: html };
    }
    return { rawScript: null, htmlText: html };
  } catch (e: any) {
    console.warn("axios fetch failed:", e?.message || e);
    return { rawScript: null, htmlText: null };
  }
};

/**
 * New: Detect common Cloudflare interstitial text or challenge
 */
const isCloudflareChallenge = (text = "") => {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("checking if the site connection is secure") ||
    t.includes("just a moment") ||
    t.includes("please enable javascript") ||
    t.includes("checking your browser before accessing") ||
    t.includes("you are being redirected")
  );
};

const scrapeWebpage = async (
  url: string,
  retryAttempts: number = 3
): Promise<QRContactData> => {
  let lastError: Error | null = null;

  // Try quick axios HTML fetch first (Option A)
  try {
    const { rawScript, htmlText } = await fetchHtmlAndExtractJson(url);
    if (rawScript) {
      console.log(
        "Found __savedQrCodeParams via axios — returning parsed payload without Puppeteer"
      );
      const parsed = parseQRCodeChimpPayload(rawScript, url);
      if (parsed) return parsed;
    }

    // If HTML looks like Cloudflare's interstitial, skip heavy Puppeteer attempts
    if (htmlText && isCloudflareChallenge(htmlText)) {
      console.warn(
        "Detected Cloudflare interstitial in direct HTML fetch — skipping Puppeteer and returning at least the URL."
      );
      return { website: url };
    }
  } catch (e) {
    console.warn("Quick HTML fetch step threw error:", (e as Error).message || e);
    // fall through to Puppeteer attempts
  }

  // Retry logic with exponential backoff for Puppeteer approach
  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    let browser: Browser | null = null;

    try {
      console.log(`🔍 Attempt ${attempt + 1}/${retryAttempts} - Scraping: ${url}`);

      // Always use bundled Puppeteer Chromium
      console.log("🔧 Using bundled Puppeteer Chromium (no serverless chromium)");
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
        ],
      });

      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
      await page.setViewport({ width: 1280, height: 720 });

      // Set user agent to avoid bot detection
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      console.log(`📄 Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // Wait for dynamic content to load
      await new Promise((resolve) => setTimeout(resolve, 3000));

      console.log("📊 Extracting data from rendered page...");

      // Extract all data from the page
      // @ts-ignore - This code runs in browser context, not Node.js
      const extractedData = await page.evaluate(() => {
        // Helper function to extract text from selectors
        const getText = (selectors: string[]): string => {
          for (const selector of selectors) {
            // @ts-ignore
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.textContent?.trim();
              if (text && text.length > 0) return text;
            }
          }
          return "";
        };

        // Helper to get meta content
        const getMeta = (names: string[]): string => {
          for (const name of names) {
            // @ts-ignore
            const meta = document.querySelector(
              `meta[name="${name}"], meta[property="${name}"]`
            );
            if (meta) {
              const content = meta.getAttribute("content");
              if (content) return content.trim();
            }
          }
          return "";
        };

        // Extract data using various selectors and patterns
        const data: any = {};

        // Get all visible text for fallback parsing
        // @ts-ignore
        data.fullText = document.body.innerText;

        // Try structured data (JSON-LD)
        // @ts-ignore
        const jsonLdScripts = document.querySelectorAll(
          'script[type="application/ld+json"]'
        );
        for (const script of jsonLdScripts) {
          try {
            const jsonData = JSON.parse(script.textContent || "");
            if (jsonData["@type"] === "Person") {
              data.jsonLd = jsonData;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Extract from meta tags
        data.metaTitle = getMeta(["title", "og:title", "twitter:title"]);
        data.metaDescription = getMeta([
          "description",
          "og:description",
          "twitter:description",
        ]);

        // Extract from common selectors
        data.name = getText([
          '[itemprop="name"]',
          ".name",
          ".full-name",
          ".person-name",
          "h1.name",
          "h2.name",
          "h1",
          "h2",
        ]);

        data.email = getText([
          '[itemprop="email"]',
          'a[href^="mailto:"]',
          ".email",
          ".e-mail",
          "[data-email]",
        ]);

        // Extract email from href if present
        // @ts-ignore
        const emailLink = document.querySelector('a[href^="mailto:"]');
        if (emailLink && !data.email) {
          const href = emailLink.getAttribute("href");
          if (href) {
            data.email = href.replace("mailto:", "").split("?")[0];
          }
        }

        data.phone = getText([
          '[itemprop="telephone"]',
          'a[href^="tel:"]',
          ".phone",
          ".tel",
          ".telephone",
          ".mobile",
          "[data-phone]",
        ]);

        // Extract phone from href if present
        // @ts-ignore
        const phoneLink = document.querySelector('a[href^="tel:"]');
        if (phoneLink && !data.phone) {
          const href = phoneLink.getAttribute("href");
          if (href) {
            data.phone = href.replace("tel:", "").trim();
          }
        }

        data.company = getText([
          '[itemprop="worksFor"]',
          '[itemprop="organization"]',
          ".company",
          ".organization",
          ".org",
        ]);

        data.position = getText([
          '[itemprop="jobTitle"]',
          ".title",
          ".job-title",
          ".position",
          ".role",
        ]);

        data.address = getText([
          '[itemprop="address"]',
          '[itemprop="streetAddress"]',
          ".address",
          ".street-address",
        ]);

        data.city = getText([
          '[itemprop="addressLocality"]',
          ".city",
          ".locality",
        ]);

        data.country = getText([
          '[itemprop="addressCountry"]',
          ".country",
        ]);

        try {
          // Attempt to capture embedded QR template payload
          // @ts-ignore
          const scripts = Array.from(document.scripts || []) as Array<any>;
          for (const script of scripts) {
            const text = script.textContent || "";
            if (text.includes("__savedQrCodeParams")) {
              const match = text.match(
                /__savedQrCodeParams\s*=\s*(\{[\s\S]*?\});?/
              );
              if (match && match[1]) {
                data.qrCodeChimpRaw = match[1];
                break;
              }
            }
          }
        } catch (err) {
          // Ignore script extraction errors
        }

        return data;
      });

      console.log("✅ Data extraction complete, processing...");
      console.log("📦 Extracted data:", JSON.stringify(extractedData, null, 2));

      // Process the extracted data
      const contactData: QRContactData = { website: url };
      const mergeIfMissing = (source?: QRContactData | null) => {
        if (!source) return;
        (Object.keys(source) as (keyof QRContactData)[]).forEach((key) => {
          const value = source[key];
          if (value && !contactData[key]) {
            contactData[key] = value;
          }
        });
      };

      // Process JSON-LD if available
      if (extractedData.jsonLd) {
        const jld = extractedData.jsonLd;
        if (jld.name) {
          const nameParts = jld.name.split(" ");
          contactData.firstName = nameParts[0];
          if (nameParts.length > 1) {
            contactData.lastName = nameParts.slice(1).join(" ");
          }
        }
        if (jld.givenName) contactData.firstName = jld.givenName;
        if (jld.familyName) contactData.lastName = jld.familyName;
        if (jld.email) contactData.email = jld.email;
        if (jld.telephone) contactData.phoneNumber = jld.telephone;
        if (jld.jobTitle) contactData.position = jld.jobTitle;
        if (jld.worksFor?.name) contactData.company = jld.worksFor.name;
      }

      // Process extracted fields
      if (extractedData.name && !contactData.firstName) {
        const nameParts = extractedData.name.split(" ");
        contactData.firstName = nameParts[0];
        if (nameParts.length > 1) {
          contactData.lastName = nameParts.slice(1).join(" ");
        }
      }

      if (extractedData.email) {
        contactData.email =
          extractEmail(extractedData.email) || extractedData.email;
      }

      if (extractedData.phone) {
        contactData.phoneNumber =
          extractPhone(extractedData.phone) || extractedData.phone;
      }

      if (extractedData.company) {
        contactData.company = extractedData.company;
      }

      if (extractedData.position) {
        contactData.position = extractedData.position;
      }

      if (extractedData.address) {
        contactData.address = extractedData.address;
      }

      if (extractedData.city) {
        contactData.city = extractedData.city;
      }

      if (extractedData.country) {
        contactData.country = extractedData.country;
      }

      if (extractedData.qrCodeChimpRaw) {
        console.log(
          "🧩 Embedded QR template payload detected, parsing as fallback..."
        );
        mergeIfMissing(parseQRCodeChimpPayload(extractedData.qrCodeChimpRaw, url));
      }

      const normalizedPageText = extractedData.fullText?.toLowerCase();
      if (
        normalizedPageText &&
        normalizedPageText.includes("just a moment") &&
        normalizedPageText.includes("checking if the site connection is secure")
      ) {
        console.warn("⚠️ Possible bot challenge detected on page content.");
      }

      // Fallback: Parse from full text if we don't have enough data
      if (!contactData.email && !contactData.phoneNumber && extractedData.fullText) {
        console.log("🔄 Applying fallback text extraction...");
        const lines = extractedData.fullText
          .split("\n")
          .filter((line: string) => line.trim());

        // Extract email from text
        contactData.email = extractEmail(extractedData.fullText);

        // Extract phone from text
        contactData.phoneNumber = extractPhone(extractedData.fullText);

        // Try to extract name from first meaningful line
        if (!contactData.firstName && lines.length > 0) {
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

        // Try to extract company
        if (!contactData.company && lines.length > 1) {
          for (let i = 1; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].trim();
            if (line.length > 2 && line.length < 100 && isValidCompany(line)) {
              contactData.company = line;
              break;
            }
          }
        }

        // Try to extract position
        if (!contactData.position && lines.length > 1) {
          for (let i = 1; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].trim();
            if (line.length > 2 && line.length < 100 && isValidPosition(line)) {
              contactData.position = line;
              break;
            }
          }
        }
      }

      console.log("✨ Final contact data:", JSON.stringify(contactData, null, 2));
      return contactData;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error("Unknown error");
      console.error(`❌ Error on attempt ${attempt + 1}:`, error.message);
      console.error(`Stack trace:`, error.stack);

      // If this isn't the last attempt, wait with exponential backoff
      if (attempt < retryAttempts - 1) {
        const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.log(
          `⏳ Retry attempt ${attempt + 2}/${retryAttempts} after ${delayMs}ms...`
        );
        await delay(delayMs);
      }
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          console.warn("Error closing browser:", closeErr);
        }
      }
    }
  }

  // All retries failed
  console.error(
    "❌ Error scraping webpage after",
    retryAttempts,
    "attempts:",
    lastError?.message
  );
  console.error("Full error:", lastError);
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
export const processQRCode = async (qrText: string): Promise<QRProcessResult> => {
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
    if (trimmedText.toLowerCase().startsWith("mailto:")) {
      console.log("📧 Detected mailto link in QR code");
      const rawContactData = parseMailtoLink(trimmedText);
      const entryCode = rawContactData.uniqueCode || "";
      const contactData = normalizeContactData(rawContactData);
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "mailto",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: contactData.email ? 1.0 : 0.5,
          rating,
        },
      };
    }

    // Check if it's a tel: link
    if (trimmedText.toLowerCase().startsWith("tel:")) {
      console.log("📞 Detected tel link in QR code");
      const rawContactData = parseTelLink(trimmedText);
      const entryCode = rawContactData.uniqueCode || "";
      const contactData = normalizeContactData(rawContactData);
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "tel",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: contactData.phoneNumber ? 1.0 : 0.5,
          rating,
        },
      };
    }

    // Check if it's a URL
    if (isURL(trimmedText)) {
      console.log("🌐 Detected URL in QR code, scraping webpage...");
      const rawContactData = await scrapeWebpage(trimmedText);
      const entryCode = rawContactData.uniqueCode || "";
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
      const rating = calculateRating(contactData);

      return {
        success: true,
        type: "url",
        data: {
          details: contactData,
          entryCode,
          rawData: trimmedText,
          confidence: parseFloat(confidence.toFixed(2)),
          rating,
        },
      };
    }

    // Check if it's a vCard
    if (isVCard(trimmedText)) {
      console.log("📇 Detected vCard in QR code, parsing...");
      const rawContactData = parseVCard(trimmedText);
      const entryCode = rawContactData.uniqueCode || "";
      const contactData = normalizeContactData(rawContactData);

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
          entryCode,
          rawData: trimmedText,
          confidence: parseFloat(confidence.toFixed(2)),
          rating,
        },
      };
    }

    // Treat as plain text
    console.log("📄 Detected plain text in QR code, extracting info...");
    const rawContactData = parsePlainText(trimmedText);
    const entryCode = rawContactData.uniqueCode || "";
    const contactData = normalizeContactData(rawContactData);

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
        entryCode,
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
