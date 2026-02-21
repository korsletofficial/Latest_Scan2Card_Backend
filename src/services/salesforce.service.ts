import axios from "axios";
import { config } from "../config/config";
import CrmToken from "../models/crmToken.model";

/**
 * Salesforce CRM Service
 * Handles OAuth flow and lead export to Salesforce CRM
 */

// Generate the Salesforce OAuth authorization URL
export const getSalesforceAuthUrl = (userId: string): string => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.SALESFORCE_CLIENT_ID,
    redirect_uri: config.SALESFORCE_REDIRECT_URI,
    state: userId,
    prompt: "consent",
  });

  return `${config.SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;
};

// Exchange authorization code for tokens
export const exchangeSalesforceCode = async (code: string, userId: string) => {
  try {
    const response = await axios.post(
      `${config.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: config.SALESFORCE_CLIENT_ID,
          client_secret: config.SALESFORCE_CLIENT_SECRET,
          redirect_uri: config.SALESFORCE_REDIRECT_URI,
          code,
        },
      }
    );

    const { access_token, refresh_token, instance_url, token_type } = response.data;

    // Save or update token in DB
    await CrmToken.findOneAndUpdate(
      { userId, provider: "salesforce" },
      {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenType: token_type || "Bearer",
        instanceUrl: instance_url,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Salesforce tokens last ~2 hours
        isActive: true,
      },
      { upsert: true, new: true }
    );

    return { success: true, message: "Salesforce connected successfully" };
  } catch (error: any) {
    console.error("Salesforce token exchange error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.error_description || "Failed to connect Salesforce account");
  }
};

// Refresh the Salesforce access token
export const refreshSalesforceToken = async (userId: string) => {
  const token = await CrmToken.findOne({ userId, provider: "salesforce", isActive: true });
  if (!token) throw new Error("Salesforce account not connected");

  try {
    const response = await axios.post(
      `${config.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
      null,
      {
        params: {
          grant_type: "refresh_token",
          client_id: config.SALESFORCE_CLIENT_ID,
          client_secret: config.SALESFORCE_CLIENT_SECRET,
          refresh_token: token.refreshToken,
        },
      }
    );

    const { access_token, instance_url } = response.data;

    token.accessToken = access_token;
    if (instance_url) token.instanceUrl = instance_url;
    token.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await token.save();

    return token;
  } catch (error: any) {
    console.error("Salesforce token refresh error:", error.response?.data || error.message);
    token.isActive = false;
    await token.save();
    throw new Error("Salesforce session expired. Please reconnect.");
  }
};

// Get valid Salesforce access token (auto-refresh if expired)
export const getValidSalesforceToken = async (userId: string) => {
  const token = await CrmToken.findOne({ userId, provider: "salesforce", isActive: true });
  if (!token) throw new Error("Salesforce account not connected. Please connect first.");

  // Refresh if token expires in less than 5 minutes
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    return await refreshSalesforceToken(userId);
  }

  return token;
};

// Map Scan2Card lead data to Salesforce Lead format
const mapLeadToSalesforceFormat = (lead: any) => {
  const details = lead.details || {};

  return {
    FirstName: details.firstName || "",
    LastName: details.lastName || "Unknown",
    Company: details.company || "Not Specified",
    Title: details.position || "",
    Email: Array.isArray(details.emails) && details.emails.length > 0 ? details.emails[0] : "",
    Phone: Array.isArray(details.phoneNumbers) && details.phoneNumbers.length > 0 ? details.phoneNumbers[0] : "",
    Website: details.website || "",
    Street: details.address || "",
    City: details.city || "",
    PostalCode: details.zipcode || "",
    Country: details.country || "",
    Description: typeof details.notes === "object" ? details.notes?.text || "" : details.notes || "",
    LeadSource: "Scan2Card",
    Rating: lead.rating ? getRatingForSalesforce(lead.rating) : "",
  };
};

// Convert rating number to Salesforce rating format
const getRatingForSalesforce = (rating: number): string => {
  if (rating >= 5) return "Hot";
  if (rating >= 3) return "Warm";
  return "Cold";
};

// Export leads to Salesforce CRM
export const exportLeadsToSalesforce = async (userId: string, leads: any[]) => {
  const token = await getValidSalesforceToken(userId);

  const results: { success: number; failed: number; errors: string[] } = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // Salesforce Composite API allows up to 200 records per request
  const batchSize = 200;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);

    const compositeRequest = {
      allOrNone: false,
      records: batch.map((lead) => ({
        attributes: { type: "Lead" },
        ...mapLeadToSalesforceFormat(lead),
      })),
    };

    try {
      const response = await axios.post(
        `${token.instanceUrl}/services/data/v59.0/composite/sobjects`,
        compositeRequest,
        {
          headers: {
            Authorization: `${token.tokenType} ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = Array.isArray(response.data) ? response.data : [];
      data.forEach((result: any) => {
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          const errorMsg = result.errors?.map((e: any) => e.message).join(", ") || "Unknown error";
          results.errors.push(errorMsg);
        }
      });
    } catch (error: any) {
      console.error("Salesforce export batch error:", error.response?.data || error.message);

      if (error.response?.status === 401) {
        try {
          await refreshSalesforceToken(userId);
          i -= batchSize;
          continue;
        } catch (refreshError) {
          results.failed += batch.length;
          results.errors.push("Authentication failed. Please reconnect Salesforce.");
          break;
        }
      }

      results.failed += batch.length;
      results.errors.push(error.response?.data?.[0]?.message || error.message || "Batch export failed");
    }
  }

  return results;
};

// Check if Salesforce is connected for a user
export const isSalesforceConnected = async (userId: string) => {
  const token = await CrmToken.findOne({ userId, provider: "salesforce", isActive: true });
  return !!token;
};

// Disconnect Salesforce for a user
export const disconnectSalesforce = async (userId: string) => {
  await CrmToken.findOneAndUpdate(
    { userId, provider: "salesforce" },
    { isActive: false }
  );
  return { success: true, message: "Salesforce disconnected successfully" };
};
