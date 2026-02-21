export const config = {
  // MongoDB
  MONGODB_URI: process.env.MONGODB_URI || "",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "scan2card_secret",

  // SMS Gateway API Key (TextPe/SmartPing)
  SMARTPING_API: process.env.SMARTPING_APIKEY || "",

  // Testing Configuration
  USE_DUMMY_OTP: process.env.USE_DUMMY_OTP === "true",
  DUMMY_OTP: process.env.DUMMY_OTP || "000000",

  // Master OTP for testing (works in all environments)
  MASTER_OTP: "987651",

  // OTP Configuration
  OTP_VALIDITY_MINUTES: 10,
  OTP_LENGTH: 6,

  // SMS Configuration
  SMS_SENDER_ID: "CSPLSC",
  SMS_CHANNEL: "2",
  SMS_DCS: "0",
  SMS_FLASH: "0",
  SMS_ROUTE: "clickhere",

  // Zoho CRM Integration
  ZOHO_CLIENT_ID: process.env.ZOHO_CLIENT_ID || "",
  ZOHO_CLIENT_SECRET: process.env.ZOHO_CLIENT_SECRET || "",
  ZOHO_REDIRECT_URI: process.env.ZOHO_REDIRECT_URI || "http://localhost:5001/api/crm/zoho/callback",
  ZOHO_API_DOMAIN: process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in",
  ZOHO_ACCOUNTS_URL: process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in",

  // Salesforce CRM Integration
  SALESFORCE_CLIENT_ID: process.env.SALESFORCE_CLIENT_ID || "",
  SALESFORCE_CLIENT_SECRET: process.env.SALESFORCE_CLIENT_SECRET || "",
  SALESFORCE_REDIRECT_URI: process.env.SALESFORCE_REDIRECT_URI || "http://localhost:5001/api/crm/salesforce/callback",
  SALESFORCE_LOGIN_URL: process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com",

  // Frontend URL (for redirecting after OAuth)
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
};

// Log configuration status on startup
if (config.USE_DUMMY_OTP) {
  console.log("🔐 OTP Mode: TESTING (Dummy OTP enabled)");
  console.log(`💡 Dummy OTP: ${config.DUMMY_OTP}`);
} else {
  if (config.SMARTPING_API && config.SMARTPING_API !== "your_smartping_api_key_here") {
    console.log("📱 OTP Mode: PRODUCTION (SMS enabled)");
  } else {
    console.log("⚠️  OTP Mode: PRODUCTION but SMS API key NOT configured!");
    console.log("💡 Set SMARTPING_APIKEY in .env or enable USE_DUMMY_OTP=true");
  }
}
