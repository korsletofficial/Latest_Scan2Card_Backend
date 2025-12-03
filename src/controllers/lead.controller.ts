import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { scanBusinessCard } from "../services/businessCardScanner.service";
import { processQRCode } from "../services/qrCodeProcessor.service";
import * as leadService from "../services/lead.service";
import { uploadFileToS3 } from '../services/awsS3.service';
import { sanitizeEmptyStrings } from '../utils/sanitize.util';

// Scan Business Card
export const scanCard = async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;

    // Validation
    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Image is required. Please provide a base64 encoded business card image.",
      });
    }

    // Validate image is not empty
    if (typeof image !== "string" || image.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid image data",
      });
    }

    console.log("📸 Scanning business card for user:", req.user?.userId);

    // Scan the business card using OpenAI
    const scanResult = await scanBusinessCard(image);

    if (!scanResult.success) {
      return res.status(400).json({
        success: false,
        message: scanResult.error || "Failed to scan business card",
      });
    }

    console.log("✅ Business card scanned successfully");

    // Return the extracted data
    return res.status(200).json({
      success: true,
      message: "Business card scanned successfully",
      data: {
        scannedCardImage: image,
        ocrText: scanResult.data?.ocrText,
        details: scanResult.data?.details,
        confidence: scanResult.data?.confidence,
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

    // Validation based on lead type
    // Handle up to 3 image uploads (card/QR + additional)
    let imageUrls: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      if (req.files.length > 3) {
        return res.status(400).json({ success: false, message: 'Maximum 3 images allowed.' });
      }
      // Upload all images to S3 (leads folder)
      const uploadPromises = req.files.map(file => uploadFileToS3(file, { folder: 'leads', makePublic: false }));
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
      isIndependentLead: sanitizedData.isIndependentLead,
      leadType,
      images: imageUrls,
      entryCode: sanitizedData.entryCode,
      ocrText: sanitizedData.ocrText,
      details: details ? sanitizeEmptyStrings(details) : undefined,
      rating: sanitizedData.rating,
    });

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: lead,
    });
  } catch (error: any) {
    console.error("Error creating lead:", error);
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

    const lead = await leadService.getLeadById(id, userId!);

    return res.status(200).json({
      success: true,
      data: lead,
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
          entryCode: result.data?.entryCode,
          rawData: result.data?.rawData,
          confidence: result.data?.confidence,
        },
      });
    }

    // For other types (url, vcard, plaintext)
    return res.status(200).json({
      success: true,
      message: "QR code processed successfully",
      leadType: "full_scan",
      data: {
        details: result.data?.details,
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
    const { type, eventId, search, rating } = req.query;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Build query parameters for the getLeads function
    const queryParams: any = {
      userId,
      userRole,
      limit: "1000", // Export all records
    };

    if (eventId && eventId !== "all") {
      queryParams.eventId = eventId;
    }

    if (search) {
      queryParams.search = search;
    }

    if (rating) {
      queryParams.rating = rating.toString();
    }

    // Get leads data
    const result = await leadService.getLeads(queryParams);
    const leads = result.leads;

    // Filter leads based on export type
    let filteredLeads = leads;
    if (type === "entryOnly") {
      // Only include leads that have entry codes
      filteredLeads = leads.filter(
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

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.send(csvContent);
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

  const rows = leads.map((lead) => [
    lead.entryCode || "",
    lead.details?.firstName || "",
    lead.details?.lastName || "",
    lead.details?.company || "",
    lead.details?.position || "",
    lead.details?.email || "",
    lead.details?.phoneNumber || "",
    lead.details?.website || "",
    lead.details?.city || "",
    lead.details?.country || "",
    lead.details?.notes || "",
    lead.eventId && typeof lead.eventId === "object"
      ? lead.eventId.eventName
      : lead.isIndependentLead
      ? "Independent"
      : "",
    lead.leadType || "",
    lead.rating || "",
    new Date(lead.createdAt).toLocaleDateString(),
  ]);

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
