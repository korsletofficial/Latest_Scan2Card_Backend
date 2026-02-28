import { Request, Response } from "express";
import { config } from "../config/config";
import { AuthRequest } from "../middleware/auth.middleware";
import * as zohoService from "../services/zoho.service";
import * as salesforceService from "../services/salesforce.service";
import * as leadService from "../services/lead.service";

/**
 * CRM Integration Controller
 * Handles Zoho & Salesforce OAuth + lead export
 */

// ==================== STATUS ====================

// Get CRM connection status for the current user
export const getCrmStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const [zohoConnected, salesforceConnected] = await Promise.all([
      zohoService.isZohoConnected(userId),
      salesforceService.isSalesforceConnected(userId),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        zoho: { connected: zohoConnected },
        salesforce: { connected: salesforceConnected },
      },
    });
  } catch (error: any) {
    console.error("CRM status error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to get CRM status" });
  }
};

// ==================== ZOHO ====================

// Initiate Zoho OAuth flow
export const connectZoho = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!config.ZOHO_CLIENT_ID) {
      return res.status(400).json({ success: false, message: "Zoho integration is not configured" });
    }

    const authUrl = zohoService.getZohoAuthUrl(userId);
    return res.status(200).json({
      success: true,
      data: { authUrl },
    });
  } catch (error: any) {
    console.error("Zoho connect error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to initiate Zoho connection" });
  }
};

// Zoho OAuth callback (redirected from Zoho)
export const zohoCallback = async (req: Request, res: Response) => {
  try {
    const { code, state: userId, error, "accounts-server": accountsServer, location } = req.query;

    if (error) {
      console.error("Zoho OAuth error:", error);
      return res.redirect(`${config.FRONTEND_URL}/leads?crm_error=zoho_denied`);
    }

    if (!code || !userId) {
      return res.redirect(`${config.FRONTEND_URL}/leads?crm_error=zoho_missing_params`);
    }

    // Zoho sends accounts-server in callback (e.g. https://accounts.zoho.in)
    // This tells us which regional server to use for token exchange
    const zohoAccountsServer = (accountsServer || location) as string | undefined;
    console.log("Zoho callback - accounts-server:", zohoAccountsServer);

    await zohoService.exchangeZohoCode(code as string, userId as string, zohoAccountsServer);

    // Redirect back to frontend with success
    return res.redirect(`${config.FRONTEND_URL}/leads?crm_connected=zoho`);
  } catch (error: any) {
    console.error("Zoho callback error:", error);
    return res.redirect(`${config.FRONTEND_URL}/leads?crm_error=zoho_failed`);
  }
};

// Disconnect Zoho
export const disconnectZoho = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    await zohoService.disconnectZoho(userId);
    return res.status(200).json({ success: true, message: "Zoho disconnected successfully" });
  } catch (error: any) {
    console.error("Zoho disconnect error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to disconnect Zoho" });
  }
};

// Export leads to Zoho
export const exportToZoho = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.activeRole;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { eventId, search, rating, licenseKey, memberId } = req.query;

    // Build query parameters
    const queryParams: any = {
      userId,
      userRole,
      limit: 1000,
    };
    if (eventId) queryParams.eventId = eventId;
    if (search) queryParams.search = search;
    if (rating) queryParams.rating = rating;
    if (licenseKey) queryParams.licenseKey = licenseKey;
    if (memberId) queryParams.memberId = memberId;

    // Get leads
    const leads = await leadService.getLeadsForExport(queryParams);

    if (!leads || leads.length === 0) {
      return res.status(400).json({ success: false, message: "No leads found to export" });
    }

    // Export to Zoho
    const result = await zohoService.exportLeadsToZoho(userId, leads);

    return res.status(200).json({
      success: true,
      message: `Exported ${result.success} leads to Zoho CRM`,
      data: {
        totalLeads: leads.length,
        exported: result.success,
        failed: result.failed,
        errors: result.errors.slice(0, 5), // Limit error messages
      },
    });
  } catch (error: any) {
    console.error("Zoho export error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to export leads to Zoho" });
  }
};

// ==================== SALESFORCE ====================

// Initiate Salesforce OAuth flow
export const connectSalesforce = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!config.SALESFORCE_CLIENT_ID) {
      return res.status(400).json({ success: false, message: "Salesforce integration is not configured" });
    }

    const authUrl = salesforceService.getSalesforceAuthUrl(userId);
    return res.status(200).json({
      success: true,
      data: { authUrl },
    });
  } catch (error: any) {
    console.error("Salesforce connect error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to initiate Salesforce connection" });
  }
};

// Salesforce OAuth callback
export const salesforceCallback = async (req: Request, res: Response) => {
  try {
    const { code, state: userId, error } = req.query;

    if (error) {
      console.error("Salesforce OAuth error:", error);
      return res.redirect(`${config.FRONTEND_URL}/leads?crm_error=salesforce_denied`);
    }

    if (!code || !userId) {
      return res.redirect(`${config.FRONTEND_URL}/leads?crm_error=salesforce_missing_params`);
    }

    await salesforceService.exchangeSalesforceCode(code as string, userId as string);

    return res.redirect(`${config.FRONTEND_URL}/leads?crm_connected=salesforce`);
  } catch (error: any) {
    console.error("Salesforce callback error:", error);
    return res.redirect(`${config.FRONTEND_URL}/leads?crm_error=salesforce_failed`);
  }
};

// Disconnect Salesforce
export const disconnectSalesforce = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    await salesforceService.disconnectSalesforce(userId);
    return res.status(200).json({ success: true, message: "Salesforce disconnected successfully" });
  } catch (error: any) {
    console.error("Salesforce disconnect error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to disconnect Salesforce" });
  }
};

// Export leads to Salesforce
export const exportToSalesforce = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.activeRole;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { eventId, search, rating, licenseKey, memberId } = req.query;

    const queryParams: any = {
      userId,
      userRole,
      limit: 1000,
    };
    if (eventId) queryParams.eventId = eventId;
    if (search) queryParams.search = search;
    if (rating) queryParams.rating = rating;
    if (licenseKey) queryParams.licenseKey = licenseKey;
    if (memberId) queryParams.memberId = memberId;

    const leads = await leadService.getLeadsForExport(queryParams);

    if (!leads || leads.length === 0) {
      return res.status(400).json({ success: false, message: "No leads found to export" });
    }

    const result = await salesforceService.exportLeadsToSalesforce(userId, leads);

    return res.status(200).json({
      success: true,
      message: `Exported ${result.success} leads to Salesforce`,
      data: {
        totalLeads: leads.length,
        exported: result.success,
        failed: result.failed,
        errors: result.errors.slice(0, 5),
      },
    });
  } catch (error: any) {
    console.error("Salesforce export error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to export leads to Salesforce" });
  }
};
