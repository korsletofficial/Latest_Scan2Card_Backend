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
