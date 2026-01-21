import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as catalogService from "../services/catalog.service";
import { CatalogCategory } from "../models/catalog.model";

// Create a new catalog
export const createCatalog = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { name, description, category, docLink, whatsappTemplate, emailTemplate } = req.body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must not exceed 100 characters"
      });
    }

    if (!category || !Object.values(CatalogCategory).includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category is required and must be one of: ${Object.values(CatalogCategory).join(", ")}`
      });
    }

    if (!docLink || typeof docLink !== "string") {
      return res.status(400).json({
        success: false,
        message: "Document link is required"
      });
    }

    if (!/^https?:\/\/.+/.test(docLink)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document link URL format"
      });
    }

    if (!whatsappTemplate || typeof whatsappTemplate !== "string") {
      return res.status(400).json({
        success: false,
        message: "WhatsApp template is required"
      });
    }

    if (whatsappTemplate.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "WhatsApp template must not exceed 1000 characters"
      });
    }

    if (!emailTemplate || !emailTemplate.subject || !emailTemplate.body) {
      return res.status(400).json({
        success: false,
        message: "Email template with subject and body is required"
      });
    }

    if (emailTemplate.subject.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Email subject must not exceed 200 characters"
      });
    }

    if (emailTemplate.body.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Email body must not exceed 5000 characters"
      });
    }

    const catalog = await catalogService.createCatalog(teamManagerId!, {
      name: name.trim(),
      description: description?.trim(),
      category,
      docLink: docLink.trim(),
      whatsappTemplate,
      emailTemplate: {
        subject: emailTemplate.subject.trim(),
        body: emailTemplate.body
      }
    });

    res.status(201).json({
      success: true,
      message: "Catalog created successfully",
      data: catalog
    });
  } catch (error: any) {
    console.error("❌ Create catalog error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create catalog"
    });
  }
};

// Get all catalogs for team manager
export const getCatalogs = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { page = 1, limit = 10, search = "", category } = req.query;

    // Validate pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive number"
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 100"
      });
    }

    // Validate category if provided
    if (category && !Object.values(CatalogCategory).includes(category as CatalogCategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${Object.values(CatalogCategory).join(", ")}`
      });
    }

    const result = await catalogService.getCatalogs(
      teamManagerId!,
      pageNum,
      limitNum,
      search as string,
      category as CatalogCategory
    );

    res.status(200).json({
      success: true,
      data: result.catalogs,
      pagination: result.pagination
    });
  } catch (error: any) {
    console.error("❌ Get catalogs error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get catalogs"
    });
  }
};

// Get a single catalog by ID
export const getCatalogById = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { catalogId } = req.params;

    if (!catalogId) {
      return res.status(400).json({
        success: false,
        message: "Catalog ID is required"
      });
    }

    const catalog = await catalogService.getCatalogById(teamManagerId!, catalogId);

    if (!catalog) {
      return res.status(404).json({
        success: false,
        message: "Catalog not found"
      });
    }

    res.status(200).json({
      success: true,
      data: catalog
    });
  } catch (error: any) {
    console.error("❌ Get catalog by ID error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get catalog"
    });
  }
};

// Update a catalog
export const updateCatalog = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { catalogId } = req.params;
    const { name, description, category, docLink, whatsappTemplate, emailTemplate, isActive } = req.body;

    if (!catalogId) {
      return res.status(400).json({
        success: false,
        message: "Catalog ID is required"
      });
    }

    // Build update object with only provided fields
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Name must be a non-empty string"
        });
      }
      if (name.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Name must not exceed 100 characters"
        });
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || "";
    }

    if (category !== undefined) {
      if (!Object.values(CatalogCategory).includes(category)) {
        return res.status(400).json({
          success: false,
          message: `Category must be one of: ${Object.values(CatalogCategory).join(", ")}`
        });
      }
      updateData.category = category;
    }

    if (docLink !== undefined) {
      if (!/^https?:\/\/.+/.test(docLink)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document link URL format"
        });
      }
      updateData.docLink = docLink.trim();
    }

    if (whatsappTemplate !== undefined) {
      if (whatsappTemplate.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "WhatsApp template must not exceed 1000 characters"
        });
      }
      updateData.whatsappTemplate = whatsappTemplate;
    }

    if (emailTemplate !== undefined) {
      if (!emailTemplate.subject || !emailTemplate.body) {
        return res.status(400).json({
          success: false,
          message: "Email template must have subject and body"
        });
      }
      if (emailTemplate.subject.length > 200) {
        return res.status(400).json({
          success: false,
          message: "Email subject must not exceed 200 characters"
        });
      }
      if (emailTemplate.body.length > 5000) {
        return res.status(400).json({
          success: false,
          message: "Email body must not exceed 5000 characters"
        });
      }
      updateData.emailTemplate = {
        subject: emailTemplate.subject.trim(),
        body: emailTemplate.body
      };
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update"
      });
    }

    const catalog = await catalogService.updateCatalog(teamManagerId!, catalogId, updateData);

    if (!catalog) {
      return res.status(404).json({
        success: false,
        message: "Catalog not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Catalog updated successfully",
      data: catalog
    });
  } catch (error: any) {
    console.error("❌ Update catalog error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update catalog"
    });
  }
};

// Delete a catalog (soft delete)
export const deleteCatalog = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { catalogId } = req.params;

    if (!catalogId) {
      return res.status(400).json({
        success: false,
        message: "Catalog ID is required"
      });
    }

    const deleted = await catalogService.deleteCatalog(teamManagerId!, catalogId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Catalog not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Catalog deleted successfully"
    });
  } catch (error: any) {
    console.error("❌ Delete catalog error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete catalog"
    });
  }
};

// Assign catalog to license key(s)
export const assignCatalogToLicenseKeys = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { catalogId } = req.params;
    const { assignments } = req.body;

    if (!catalogId) {
      return res.status(400).json({
        success: false,
        message: "Catalog ID is required"
      });
    }

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Assignments array is required and must not be empty"
      });
    }

    // Validate each assignment
    for (const assignment of assignments) {
      if (!assignment.eventId || !assignment.licenseKey) {
        return res.status(400).json({
          success: false,
          message: "Each assignment must have eventId and licenseKey"
        });
      }
    }

    const catalog = await catalogService.assignCatalogToLicenseKeys(
      teamManagerId!,
      catalogId,
      assignments
    );

    res.status(200).json({
      success: true,
      message: "Catalog assigned to license keys successfully",
      data: catalog
    });
  } catch (error: any) {
    console.error("❌ Assign catalog error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to assign catalog"
    });
  }
};

// Unassign catalog from license key(s)
export const unassignCatalogFromLicenseKeys = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { catalogId } = req.params;
    const { assignments } = req.body;

    if (!catalogId) {
      return res.status(400).json({
        success: false,
        message: "Catalog ID is required"
      });
    }

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Assignments array is required and must not be empty"
      });
    }

    const catalog = await catalogService.unassignCatalogFromLicenseKeys(
      teamManagerId!,
      catalogId,
      assignments
    );

    res.status(200).json({
      success: true,
      message: "Catalog unassigned from license keys successfully",
      data: catalog
    });
  } catch (error: any) {
    console.error("❌ Unassign catalog error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to unassign catalog"
    });
  }
};

// Get catalogs for a specific license key (used when sending to leads)
export const getCatalogsForLicenseKey = async (req: AuthRequest, res: Response) => {
  try {
    const { eventId, licenseKey } = req.params;

    if (!eventId || !licenseKey) {
      return res.status(400).json({
        success: false,
        message: "Event ID and license key are required"
      });
    }

    const catalogs = await catalogService.getCatalogsForLicenseKey(eventId, licenseKey);

    res.status(200).json({
      success: true,
      data: catalogs
    });
  } catch (error: any) {
    console.error("❌ Get catalogs for license key error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get catalogs"
    });
  }
};

// Get available catalog categories
export const getCatalogCategories = async (_req: AuthRequest, res: Response) => {
  try {
    const categories = catalogService.getCatalogCategories();

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    console.error("❌ Get catalog categories error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get categories"
    });
  }
};

// Get catalog stats for team manager
export const getCatalogStats = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;

    const stats = await catalogService.getCatalogStats(teamManagerId!);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error("❌ Get catalog stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get catalog stats"
    });
  }
};

// Get available license keys for catalog assignment
export const getAvailableLicenseKeys = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { catalogId } = req.query;

    const licenseKeys = await catalogService.getAvailableLicenseKeysForAssignment(
      teamManagerId!,
      catalogId as string
    );

    res.status(200).json({
      success: true,
      data: licenseKeys
    });
  } catch (error: any) {
    console.error("❌ Get available license keys error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get available license keys"
    });
  }
};

// Process template with lead data (preview)
export const previewTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { template, templateType, data } = req.body;

    if (!template || typeof template !== "string") {
      return res.status(400).json({
        success: false,
        message: "Template is required"
      });
    }

    if (!templateType || !["whatsapp", "email"].includes(templateType)) {
      return res.status(400).json({
        success: false,
        message: "Template type must be 'whatsapp' or 'email'"
      });
    }

    const processedTemplate = catalogService.processTemplate(template, data || {});

    res.status(200).json({
      success: true,
      data: {
        original: template,
        processed: processedTemplate
      }
    });
  } catch (error: any) {
    console.error("❌ Preview template error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to preview template"
    });
  }
};
