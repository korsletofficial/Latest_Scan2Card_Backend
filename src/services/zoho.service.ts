import axios from "axios";
import { config } from "../config/config";
import CrmToken from "../models/crmToken.model";

/**
 * Zoho CRM Service
 * Handles OAuth flow and lead export to Zoho CRM
 */

// Generate the Zoho OAuth authorization URL
export const getZohoAuthUrl = (userId: string): string => {
  const params = new URLSearchParams({
    scope: "ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.READ,ZohoCRM.modules.contacts.CREATE,ZohoCRM.modules.contacts.READ",
    client_id: config.ZOHO_CLIENT_ID,
    response_type: "code",
    access_type: "offline",
    redirect_uri: config.ZOHO_REDIRECT_URI,
    state: userId, // Pass userId to identify user in callback
    prompt: "consent",
  });

  return `${config.ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${params.toString()}`;
};

// Exchange authorization code for tokens
// accountsServer is the Zoho accounts domain from the OAuth callback (e.g. https://accounts.zoho.in)
export const exchangeZohoCode = async (code: string, userId: string, accountsServer?: string) => {
  // Use the accounts server from the callback, or fall back to config
  const accountsUrl = accountsServer || config.ZOHO_ACCOUNTS_URL;

  try {
    const response = await axios.post(
      `${accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: config.ZOHO_CLIENT_ID,
          client_secret: config.ZOHO_CLIENT_SECRET,
          redirect_uri: config.ZOHO_REDIRECT_URI,
          code,
        },
      }
    );

    const { access_token, refresh_token, expires_in, token_type, api_domain } = response.data;

    console.log("Zoho token response:", JSON.stringify(response.data, null, 2));

    // expires_in may be undefined or a string; default to 1 hour (3600 seconds)
    const expiresInSeconds = Number(expires_in) || 3600;

    // Save or update token in DB (store accountsUrl for future token refreshes)
    await CrmToken.findOneAndUpdate(
      { userId, provider: "zoho" },
      {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenType: token_type || "Bearer",
        apiDomain: api_domain || config.ZOHO_API_DOMAIN,
        accountsUrl: accountsUrl,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        isActive: true,
      },
      { upsert: true, new: true }
    );

    return { success: true, message: "Zoho connected successfully" };
  } catch (error: any) {
    console.error("Zoho token exchange error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.error || "Failed to connect Zoho account");
  }
};

// Refresh the Zoho access token using refresh token
export const refreshZohoToken = async (userId: string) => {
  const token = await CrmToken.findOne({ userId, provider: "zoho", isActive: true });
  if (!token) throw new Error("Zoho account not connected");

  // Use the stored accounts URL for this user's region
  const accountsUrl = token.accountsUrl || config.ZOHO_ACCOUNTS_URL;

  try {
    const response = await axios.post(
      `${accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          grant_type: "refresh_token",
          client_id: config.ZOHO_CLIENT_ID,
          client_secret: config.ZOHO_CLIENT_SECRET,
          refresh_token: token.refreshToken,
        },
      }
    );

    const { access_token, expires_in } = response.data;

    const expiresInSeconds = Number(expires_in) || 3600;
    token.accessToken = access_token;
    token.expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    await token.save();

    return token;
  } catch (error: any) {
    console.error("Zoho token refresh error:", error.response?.data || error.message);
    // Mark token as inactive if refresh fails
    token.isActive = false;
    await token.save();
    throw new Error("Zoho session expired. Please reconnect.");
  }
};

// Get valid Zoho access token (auto-refresh if expired)
export const getValidZohoToken = async (userId: string) => {
  const token = await CrmToken.findOne({ userId, provider: "zoho", isActive: true });
  if (!token) throw new Error("Zoho account not connected. Please connect first.");

  // Refresh if token expires in less than 5 minutes
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    return await refreshZohoToken(userId);
  }

  return token;
};

// Map Scan2Card lead data to Zoho CRM lead format
const mapLeadToZohoFormat = (lead: any) => {
  const details = lead.details || {};

  return {
    First_Name: details.firstName || "",
    Last_Name: details.lastName || "Unknown",
    Company: details.company || "Not Specified",
    Designation: details.position || "",
    Email: Array.isArray(details.emails) && details.emails.length > 0 ? details.emails[0] : "",
    Phone: Array.isArray(details.phoneNumbers) && details.phoneNumbers.length > 0 ? details.phoneNumbers[0] : "",
    Website: details.website || "",
    Street: details.address || "",
    City: details.city || "",
    Zip_Code: details.zipcode || "",
    Country: details.country || "",
    Description: typeof details.notes === "object" ? details.notes?.text || "" : details.notes || "",
    Lead_Source: "Scan2Card",
    Rating: lead.rating ? getRatingForZoho(lead.rating) : "",
  };
};

// Convert rating number to Zoho rating format
const getRatingForZoho = (rating: number): string => {
  if (rating >= 5) return "-Positive";
  if (rating >= 3) return "-None";
  return "-Negative";
};

// Export leads to Zoho CRM
export const exportLeadsToZoho = async (userId: string, leads: any[]) => {
  const token = await getValidZohoToken(userId);

  // Zoho API allows max 100 records per request
  const batchSize = 100;
  const results: { success: number; failed: number; errors: string[] } = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const zohoLeads = batch.map(mapLeadToZohoFormat);

    try {
      const response = await axios.post(
        `${token.apiDomain || config.ZOHO_API_DOMAIN}/crm/v2/Leads`,
        { data: zohoLeads },
        {
          headers: {
            Authorization: `${token.tokenType} ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data.data || [];
      data.forEach((result: any) => {
        if (result.status === "success") {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(result.message || "Unknown error");
        }
      });
    } catch (error: any) {
      console.error("Zoho export batch error:", error.response?.data || error.message);

      // If unauthorized, try refreshing token and retry
      if (error.response?.status === 401) {
        try {
          await refreshZohoToken(userId);
          // Retry this batch (decrement i to retry)
          i -= batchSize;
          continue;
        } catch (refreshError) {
          results.failed += batch.length;
          results.errors.push("Authentication failed. Please reconnect Zoho.");
          break;
        }
      }

      results.failed += batch.length;
      results.errors.push(error.response?.data?.message || error.message || "Batch export failed");
    }
  }

  return results;
};

// Check if Zoho is connected for a user
export const isZohoConnected = async (userId: string) => {
  const token = await CrmToken.findOne({ userId, provider: "zoho", isActive: true });
  return !!token;
};

// Disconnect Zoho for a user
export const disconnectZoho = async (userId: string) => {
  await CrmToken.findOneAndUpdate(
    { userId, provider: "zoho" },
    { isActive: false }
  );
  return { success: true, message: "Zoho disconnected successfully" };
};
