import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { scanBusinessCard } from "../services/businessCardScanner.service";
import { processQRCode } from "../services/qrCodeProcessor.service";
import * as leadService from "../services/lead.service";
import { uploadFileToS3, uploadCSVToS3 } from '../services/awsS3.service';
import { sanitizeEmptyStrings } from '../utils/sanitize.util';

// Scan Business Card
export const scanCard = async (req: AuthRequest, res: Response) => {
  try {
    const { image, frontOcrText, backOcrText, isOCRText } = req.body;

    // Validation - require either image or frontOcrText
    if (!image && !frontOcrText) {
      return res.status(400).json({
        success: false,
        message: "Either 'image' (base64) or 'frontOcrText' (string) is required for business card scanning.",
      });
    }

    if (image && typeof image !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid image data - must be a base64 encoded string",
      });
    }

    if (frontOcrText && typeof frontOcrText !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid frontOcrText - must be a string",
      });
    }

    if (backOcrText && typeof backOcrText !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid backOcrText - must be a string",
      });
    }

    console.log(`📸 Scanning business card for user: ${req.user?.userId} (${frontOcrText ? "OCR text" : "image"})`);

    // Determine processing method and combine OCR texts if both front and back exist
    const isProcessingOCR = Boolean(frontOcrText) || Boolean(isOCRText);
    let combinedOcrText = '';

    if (frontOcrText) {
      combinedOcrText = frontOcrText;
      if (backOcrText && backOcrText.trim()) {
        // Combine front and back text with a separator for better analysis
        combinedOcrText = `${frontOcrText}\n\n--- BACK SIDE ---\n\n${backOcrText}`;
        console.log('📋 Combined front and back OCR text for analysis');
      }
    }

    const inputData = combinedOcrText || image;

    // Scan the business card
    const scanResult = await scanBusinessCard(inputData, isProcessingOCR);

    if (!scanResult.success) {
      return res.status(400).json({
        success: false,
        message: scanResult.error || "Failed to scan business card",
      });
    }

    console.log(`✅ Business card scanned successfully (${scanResult.data?.processingMethod})`);

    // Return the extracted data
    return res.status(200).json({
      success: true,
      message: "Business card scanned successfully",
      data: {
        scannedCardImage: image || "",
        frontOcrText: frontOcrText || "",
        backOcrText: backOcrText || "",
        details: scanResult.data?.details,
        confidence: scanResult.data?.confidence,
        processingMethod: scanResult.data?.processingMethod,
      },
    });
  } catch (error: any) {
    console.error("❌ Error scanning business card:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error while scanning business card",
    });
  }
};

// Create Lead
export const createLead = async (req: AuthRequest, res: Response) => {
  try {
    const {
      eventId,
      isIndependentLead,
      leadType = "full_scan",
      scannedCardImage, // @deprecated - kept for backward compatibility
      images, // New: array of S3 URLs
      entryCode,
      ocrText,
      details: detailsRaw,
      rating,
      allowDuplicate, // New: skip duplicate check if true
    } = req.body;
    const userId = req.user?.userId;

    // Parse details if it's a JSON string (from multipart/form-data)
    let details;
    if (detailsRaw) {
      try {
        details = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid details format' });
      }
    }

    // VALIDATE DETAILS FIELDS
    if (details) {
      // Validate email format, count, and length
      if (details.emails && Array.isArray(details.emails)) {
        if (details.emails.length > 10) {
          return res.status(400).json({ 
            success: false, 
            message: 'Maximum 10 email addresses allowed' 
          });
        }
        
        // Check individual email length
        const tooLongEmails = details.emails.filter((email: string) => String(email).length > 255);
        if (tooLongEmails.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: `Email address(es) too long. Maximum 255 characters per email` 
          });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = details.emails.filter((email: string) => !emailRegex.test(String(email)));
        if (invalidEmails.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: `Invalid email format: ${invalidEmails.slice(0, 3).join(', ')}${invalidEmails.length > 3 ? '...' : ''}` 
          });
        }
      }

      // Validate phone format, count, and length
      if (details.phoneNumbers && Array.isArray(details.phoneNumbers)) {
        if (details.phoneNumbers.length > 10) {
          return res.status(400).json({ 
            success: false, 
            message: 'Maximum 10 phone numbers allowed' 
          });
        }
        
        // Check individual phone length
        const tooLongPhones = details.phoneNumbers.filter((phone: string) => String(phone).length > 20);
        if (tooLongPhones.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: `Phone number(s) too long. Maximum 20 characters per phone number` 
          });
        }
        
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        const invalidPhones = details.phoneNumbers.filter((phone: string) => !phoneRegex.test(String(phone)));
        if (invalidPhones.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: `Invalid phone format: ${invalidPhones.slice(0, 3).join(', ')}${invalidPhones.length > 3 ? '...' : ''}` 
          });
        }
      }

      // Validate zipcode length
      if (details.zipcode && String(details.zipcode).length > 20) {
        return res.status(400).json({ 
          success: false, 
          message: 'Zipcode too long. Maximum 20 characters allowed.' 
        });
      }

      // Validate total payload size of details object
      const detailsJson = JSON.stringify(details);
      if (detailsJson.length > 10000) {
        return res.status(400).json({ 
          success: false, 
          message: 'Details object is too large. Maximum 10KB allowed.' 
        });
      }
    }

    // Validation based on lead type
    // Handle up to 3 image uploads (card/QR + additional)
    let imageUrls: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      if (req.files.length > 3) {
        return res.status(400).json({ success: false, message: 'Maximum 3 images allowed.' });
      }
      // Upload all images to S3 (leads folder)
      const uploadPromises = req.files.map(file => uploadFileToS3(file, { folder: 'leads', makePublic: true }));
      const results = await Promise.all(uploadPromises);
      imageUrls = results.map(r => r.url);
    }

    // Sanitize empty strings to undefined
    const sanitizedData = sanitizeEmptyStrings({
      eventId,
      isIndependentLead,
      entryCode,
      ocrText,
      rating,
    });

    // Validation based on lead type
    // Only entry_code type requires its specific field
    if (leadType === "entry_code") {
      if (!sanitizedData.entryCode) {
        return res.status(400).json({ success: false, message: "Entry code is required for entry code type leads" });
      }
    }
    // Images are now optional for all lead types including full_scan

    const lead = await leadService.createLead({
      userId: userId!,
      eventId: sanitizedData.eventId,
      isIndependentLead: sanitizedData.isIndependentLead === true || sanitizedData.isIndependentLead === 'true',
      leadType,
      images: imageUrls,
      entryCode: sanitizedData.entryCode,
      ocrText: sanitizedData.ocrText,
      details: details ? sanitizeEmptyStrings(details) : undefined,
      rating: sanitizedData.rating,
      allowDuplicate: allowDuplicate === true || allowDuplicate === 'true',
    });

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: lead,
    });
  } catch (error: any) {
    console.error("Error creating lead:", error);

    // Handle duplicate lead error with special response
    if (error.isDuplicate) {
      return res.status(409).json({
        success: false,
        isDuplicate: true,
        message: error.message,
        duplicateInfo: error.duplicateInfo,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get All Leads (with pagination and filters)
export const getLeads = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const {
      page = 1,
      limit = 10,
      eventId,
      isIndependentLead,
      rating,
      search,
      minimal,
      period, // New: "today" | "weekly" | "earlier"
      timeZone = "Asia/Kolkata", // New: user's timezone
      licenseKey, // New: filter by license key/stall
      canCreateMeeting, // Filter leads where user can create meetings
    } = req.query;

    const result = await leadService.getLeads({
      userId: userId!,
      userRole: userRole!,
      page: Number(page),
      limit: Number(limit),
      eventId: eventId as string,
      isIndependentLead: isIndependentLead as string,
      rating: rating as string,
      search: search as string,
      minimal: minimal === 'true',
      period: period as "today" | "weekly" | "earlier" | undefined,
      timeZone: timeZone as string,
      licenseKey: licenseKey as string,
      canCreateMeeting: canCreateMeeting as string,
    });

    return res.status(200).json({
      success: true,
      data: result.leads,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("Error fetching leads:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get Lead by ID
export const getLeadById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const { lead, licenseKey } = await leadService.getLeadById(id, userId!);

    // Transform response to rename eventId to event and include licenseKey
    const leadData = lead.toJSON();
    const responseData = {
      ...leadData,
      event: leadData.eventId ? {
        _id: (leadData.eventId as any)._id,
        eventName: (leadData.eventId as any).eventName,
      } : null,
      licenseKey: licenseKey,
    };
    delete (responseData as any).eventId;

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error("Error fetching lead:", error);
    return res.status(error.message === "Lead not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Update Lead
export const updateLead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const {
      eventId,
      isIndependentLead,
      leadType,
      scannedCardImage,
      images,
      entryCode,
      ocrText,
      details,
      rating,
      isActive,
    } = req.body;

    // Validate images array if provided
    if (images) {
      if (!Array.isArray(images)) {
        return res.status(400).json({
          success: false,
          message: "Images must be an array",
        });
      }

      if (images.length > 3) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 images allowed per lead",
        });
      }
    }

    // Sanitize empty strings to undefined
    const sanitizedData = sanitizeEmptyStrings({
      eventId,
      isIndependentLead,
      leadType,
      scannedCardImage,
      entryCode,
      ocrText,
      rating,
      isActive,
    });

    const lead = await leadService.updateLead(id, userId!, {
      eventId: sanitizedData.eventId,
      isIndependentLead: sanitizedData.isIndependentLead,
      leadType: sanitizedData.leadType,
      scannedCardImage: sanitizedData.scannedCardImage,
      images,
      entryCode: sanitizedData.entryCode,
      ocrText: sanitizedData.ocrText,
      details: details ? sanitizeEmptyStrings(details) : undefined,
      rating: sanitizedData.rating,
      isActive: sanitizedData.isActive,
    });

    return res.status(200).json({
      success: true,
      message: "Lead updated successfully",
      data: lead,
    });
  } catch (error: any) {
    console.error("Error updating lead:", error);
    return res.status(error.message === "Lead not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Delete Lead (Soft Delete)
export const deleteLead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await leadService.deleteLead(id, userId!);

    return res.status(200).json({
      success: true,
      message: "Lead deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting lead:", error);
    return res.status(error.message === "Lead not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get Lead Statistics
export const getLeadStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const stats = await leadService.getLeadStats(userId!);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("Error fetching lead stats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Scan QR Code (digital business card)
export const scanQRCode = async (req: AuthRequest, res: Response) => {
  try {
    const { qrText } = req.body;

    // Validation
    if (!qrText || typeof qrText !== "string" || qrText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "QR code text is required. Please provide the decoded QR text.",
      });
    }

    console.log("🔍 Scanning QR code for user:", req.user?.userId);

    // Process the QR code text
    const result = await processQRCode(qrText);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Failed to process QR code",
      });
    }

    // Return the extracted data based on type
    if (result.type === "entry_code") {
      return res.status(200).json({
        success: true,
        message: "Entry code detected successfully",
        leadType: "entry_code",
        data: {
          entryCode: result.data?.entryCode || '',
          rawData: result.data?.rawData,
          confidence: result.data?.confidence,
        },
      });
    }

    // For other types (url, vcard, plaintext, mailto, tel)
    return res.status(200).json({
      success: true,
      message: "QR code processed successfully",
      leadType: "full_scan",
      data: {
        details: result.data?.details,
        entryCode: result.data?.entryCode || '', // Always include entryCode for consistency
        rawData: result.data?.rawData,
        confidence: result.data?.confidence,
      },
      type: result.type,
    });
  } catch (error: any) {
    console.error("❌ Error scanning QR code:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error while scanning QR code",
    });
  }
};

// Get Lead Analytics (Day-wise and Month-wise)
export const getLeadAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { timeZone = "UTC" } = req.query;

    const analytics = await leadService.getLeadAnalytics(
      userId!,
      userRole!,
      timeZone as string
    );

    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error("Error fetching lead analytics:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Export Leads to CSV
export const exportLeads = async (req: AuthRequest, res: Response) => {
  try {
    const { type, eventId, search, rating, licenseKey } = req.query;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Build query parameters for the export function
    const queryParams: any = {
      userId,
      userRole,
      limit: 1000, // Export all records
    };

    if (eventId) {
      queryParams.eventId = eventId;
    }

    if (search) {
      queryParams.search = search;
    }

    if (rating) {
      queryParams.rating = rating;
    }

    if (licenseKey) {
      queryParams.licenseKey = licenseKey;
    }

    // Get leads data with all fields for export
    const leads = await leadService.getLeadsForExport(queryParams);

    // Fetch event details for all leads that have eventId
    const eventIds = leads
      .filter((lead: any) => lead.eventId)
      .map((lead: any) => lead.eventId);

    const events = await leadService.getEventsByIds(eventIds);

    // Create a map of eventId -> eventName for quick lookup
    const eventMap = new Map(
      events.map((event: any) => [event._id.toString(), event.eventName])
    );

    // Add event names to leads (leads are already plain objects from lean())
    const leadsWithEventNames = leads.map((lead: any) => ({
      ...lead,
      eventName: lead.eventId ? eventMap.get(lead.eventId.toString()) : null,
    }));

    // Filter leads based on export type
    let filteredLeads = leadsWithEventNames;
    if (type === "entryOnly") {
      // Only include leads that have entry codes
      filteredLeads = leadsWithEventNames.filter(
        (lead: any) => lead.entryCode && lead.entryCode.trim() !== ""
      );
    }

    // Generate CSV content based on export type
    let csvContent: string;
    let filename: string;

    if (type === "entryOnly") {
      // Entry Code only export
      csvContent = generateEntryCodeCSV(filteredLeads);
      filename = `entry-codes-${new Date().toISOString().split("T")[0]}.csv`;
    } else {
      // Full data export
      csvContent = generateFullDataCSV(filteredLeads);
      filename = `leads-export-${new Date().toISOString().split("T")[0]}.csv`;
    }

    // Upload CSV to S3 instead of sending raw data
    const uploadResult = await uploadCSVToS3(csvContent, filename, {
      folder: 'csv-exports',
      makePublic: true,
    });

    // Return the S3 URL
    return res.status(200).json({
      success: true,
      message: "Leads exported successfully",
      data: {
        url: uploadResult.url,
        filename: filename,
        key: uploadResult.key,
        size: uploadResult.size,
        leadsCount: filteredLeads.length,
      },
    });
  } catch (error: any) {
    console.error("Export error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to export leads data",
    });
  }
};

// Helper: Generate Entry Code CSV
const generateEntryCodeCSV = (leads: any[]): string => {
  const headers = ["Entry Code"];
  const rows = leads.map((lead) => [lead.entryCode]);
  return generateCSV(headers, rows);
};

// Helper: Convert rating number to text label
const getRatingLabel = (rating: number | string | undefined): string => {
  if (!rating) return "";

  const numRating = typeof rating === "string" ? parseInt(rating, 10) : rating;

  if (isNaN(numRating)) return "";

  if (numRating === 1 || numRating === 2) return "cold";
  if (numRating === 3 || numRating === 4) return "warm";
  if (numRating === 5) return "hot";

  return "";
};

// Helper: Generate Full Data CSV
const generateFullDataCSV = (leads: any[]): string => {
  const headers = [
    "Entry Code",
    "First Name",
    "Last Name",
    "Company",
    "Position",
    "Email",
    "Phone Number",
    "Website",
    "City",
    "Country",
    "Notes",
    "Event",
    "Lead Type",
    "Rating",
    "Created Date",
  ];

  const rows = leads.map((lead) => {
    // Format date properly
    let formattedDate = "";
    if (lead.createdAt) {
      try {
        const date = new Date(lead.createdAt);
        if (!isNaN(date.getTime())) {
          formattedDate = date.toLocaleDateString();
        }
      } catch (e) {
        console.error("Error formatting date:", e);
      }
    }

    return [
      lead.entryCode || "",
      lead.details?.firstName || "",
      lead.details?.lastName || "",
      lead.details?.company || "",
      lead.details?.position || "",
      (Array.isArray(lead.details?.emails) ? lead.details.emails.join(", ") : (lead.details?.email || "")),
      (Array.isArray(lead.details?.phoneNumbers) ? lead.details.phoneNumbers.join(", ") : (lead.details?.phoneNumber || "")),
      lead.details?.website || "",
      lead.details?.city || "",
      lead.details?.country || "",
      lead.details?.notes || "",
      lead.eventName || (lead.isIndependentLead ? "Independent" : ""),
      lead.leadType || "",
      getRatingLabel(lead.rating),
      formattedDate,
    ];
  });

  return generateCSV(headers, rows);
};

// Helper: Generate CSV
const generateCSV = (headers: string[], rows: string[][]): string => {
  const csvRows = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map((row) => row.map(escapeCSVValue).join(",")),
  ];
  return csvRows.join("\n");
};

// Helper: Escape CSV Value
const escapeCSVValue = (value: string): string => {
  if (value === null || value === undefined) {
    return "";
  }

  let stringValue = String(value);

  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    stringValue = '"' + stringValue.replace(/"/g, '""') + '"';
  }

  return stringValue;
};

// Get Lead Stats by Period (Weekly/Monthly/Yearly)
export const getLeadStatsByPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { filter, timeZone = "UTC" } = req.query;

    // Validate filter parameter
    if (!filter || !["weekly", "monthly", "yearly"].includes(filter as string)) {
      return res.status(400).json({
        success: false,
        message: "Invalid filter. Must be 'weekly', 'monthly', or 'yearly'",
      });
    }

    const stats = await leadService.getLeadStatsByPeriod(
      userId!,
      userRole!,
      filter as "weekly" | "monthly" | "yearly",
      timeZone as string
    );

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("Error fetching lead stats by period:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get User Trial Status
export const getTrialStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const trialStatus = await leadService.getUserTrialStatus(userId);

    return res.status(200).json({
      success: true,
      data: trialStatus,
    });
  } catch (error: any) {
    console.error("Error fetching trial status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
