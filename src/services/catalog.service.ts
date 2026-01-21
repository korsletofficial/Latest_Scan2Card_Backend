import CatalogModel, { ICatalog, CatalogCategory } from "../models/catalog.model";
import EventModel from "../models/event.model";
import mongoose from "mongoose";

// Interface for create catalog input
interface CreateCatalogInput {
  name: string;
  description?: string;
  category: CatalogCategory;
  docLink: string;
  whatsappTemplate: string;
  emailTemplate: {
    subject: string;
    body: string;
  };
}

// Interface for update catalog input
interface UpdateCatalogInput {
  name?: string;
  description?: string;
  category?: CatalogCategory;
  docLink?: string;
  whatsappTemplate?: string;
  emailTemplate?: {
    subject: string;
    body: string;
  };
  isActive?: boolean;
}

// Create a new catalog
export const createCatalog = async (
  teamManagerId: string,
  catalogData: CreateCatalogInput
): Promise<ICatalog> => {
  const catalog = new CatalogModel({
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    name: catalogData.name,
    description: catalogData.description,
    category: catalogData.category,
    docLink: catalogData.docLink,
    whatsappTemplate: catalogData.whatsappTemplate,
    emailTemplate: catalogData.emailTemplate,
    assignedLicenseKeys: [],
    isActive: true,
    isDeleted: false
  });

  await catalog.save();
  return catalog;
};

// Get all catalogs for a team manager with pagination and filters
export const getCatalogs = async (
  teamManagerId: string,
  page: number = 1,
  limit: number = 10,
  search: string = "",
  category?: CatalogCategory
) => {
  const query: any = {
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    isDeleted: false
  };

  // Add category filter if provided
  if (category) {
    query.category = category;
  }

  // Add search filter if provided
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } }
    ];
  }

  // Get total count
  const total = await CatalogModel.countDocuments(query);

  // Get paginated catalogs
  const catalogs = await CatalogModel.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    catalogs,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    }
  };
};

// Get a single catalog by ID
export const getCatalogById = async (
  teamManagerId: string,
  catalogId: string
): Promise<ICatalog | null> => {
  const catalog = await CatalogModel.findOne({
    _id: new mongoose.Types.ObjectId(catalogId),
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    isDeleted: false
  });

  return catalog;
};

// Update a catalog
export const updateCatalog = async (
  teamManagerId: string,
  catalogId: string,
  updateData: UpdateCatalogInput
): Promise<ICatalog | null> => {
  const catalog = await CatalogModel.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(catalogId),
      teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
      isDeleted: false
    },
    { $set: updateData },
    { new: true }
  );

  return catalog;
};

// Soft delete a catalog
export const deleteCatalog = async (
  teamManagerId: string,
  catalogId: string
): Promise<boolean> => {
  const result = await CatalogModel.updateOne(
    {
      _id: new mongoose.Types.ObjectId(catalogId),
      teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
      isDeleted: false
    },
    { $set: { isDeleted: true } }
  );

  return result.modifiedCount > 0;
};

// Assign catalog to license key(s)
export const assignCatalogToLicenseKeys = async (
  teamManagerId: string,
  catalogId: string,
  assignments: { eventId: string; licenseKey: string }[]
): Promise<ICatalog | null> => {
  // First verify the catalog belongs to this team manager
  const catalog = await CatalogModel.findOne({
    _id: new mongoose.Types.ObjectId(catalogId),
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    isDeleted: false
  });

  if (!catalog) {
    throw new Error("Catalog not found or access denied");
  }

  // Verify each license key belongs to this team manager
  for (const assignment of assignments) {
    const event = await EventModel.findOne({
      _id: new mongoose.Types.ObjectId(assignment.eventId),
      "licenseKeys.key": assignment.licenseKey.toUpperCase(),
      "licenseKeys.teamManagerId": new mongoose.Types.ObjectId(teamManagerId),
      isDeleted: false
    });

    if (!event) {
      throw new Error(`License key ${assignment.licenseKey} not found or you don't have access to it`);
    }
  }

  // Add new assignments (avoid duplicates)
  const existingKeys = new Set(
    catalog.assignedLicenseKeys.map(
      (ak) => `${ak.eventId.toString()}-${ak.licenseKey}`
    )
  );

  const newAssignments = assignments
    .filter((a) => !existingKeys.has(`${a.eventId}-${a.licenseKey.toUpperCase()}`))
    .map((a) => ({
      eventId: new mongoose.Types.ObjectId(a.eventId),
      licenseKey: a.licenseKey.toUpperCase()
    }));

  if (newAssignments.length > 0) {
    catalog.assignedLicenseKeys.push(...newAssignments);
    await catalog.save();
  }

  return catalog;
};

// Unassign catalog from license key(s)
export const unassignCatalogFromLicenseKeys = async (
  teamManagerId: string,
  catalogId: string,
  assignments: { eventId: string; licenseKey: string }[]
): Promise<ICatalog | null> => {
  // First verify the catalog belongs to this team manager
  const catalog = await CatalogModel.findOne({
    _id: new mongoose.Types.ObjectId(catalogId),
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    isDeleted: false
  });

  if (!catalog) {
    throw new Error("Catalog not found or access denied");
  }

  // Remove the specified assignments
  const keysToRemove = new Set(
    assignments.map((a) => `${a.eventId}-${a.licenseKey.toUpperCase()}`)
  );

  catalog.assignedLicenseKeys = catalog.assignedLicenseKeys.filter(
    (ak) => !keysToRemove.has(`${ak.eventId.toString()}-${ak.licenseKey}`)
  );

  await catalog.save();
  return catalog;
};

// Get catalogs assigned to a specific license key
export const getCatalogsForLicenseKey = async (
  eventId: string,
  licenseKey: string
) => {
  const catalogs = await CatalogModel.find({
    "assignedLicenseKeys.eventId": new mongoose.Types.ObjectId(eventId),
    "assignedLicenseKeys.licenseKey": licenseKey.toUpperCase(),
    isActive: true,
    isDeleted: false
  }).lean();

  return catalogs;
};

// Get catalog categories
export const getCatalogCategories = () => {
  return Object.values(CatalogCategory).map((category) => ({
    value: category,
    label: category.charAt(0).toUpperCase() + category.slice(1)
  }));
};

// Get catalog stats for team manager
export const getCatalogStats = async (teamManagerId: string) => {
  const totalCatalogs = await CatalogModel.countDocuments({
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    isDeleted: false
  });

  const activeCatalogs = await CatalogModel.countDocuments({
    teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
    isActive: true,
    isDeleted: false
  });

  // Count catalogs by category
  const categoryStats = await CatalogModel.aggregate([
    {
      $match: {
        teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
        isDeleted: false
      }
    },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 }
      }
    }
  ]);

  // Count total assignments
  const assignmentStats = await CatalogModel.aggregate([
    {
      $match: {
        teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
        isDeleted: false
      }
    },
    {
      $project: {
        assignmentCount: { $size: "$assignedLicenseKeys" }
      }
    },
    {
      $group: {
        _id: null,
        totalAssignments: { $sum: "$assignmentCount" }
      }
    }
  ]);

  return {
    totalCatalogs,
    activeCatalogs,
    inactiveCatalogs: totalCatalogs - activeCatalogs,
    categoryBreakdown: categoryStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {} as Record<string, number>),
    totalAssignments: assignmentStats[0]?.totalAssignments || 0
  };
};

// Replace template placeholders with actual values
export const processTemplate = (
  template: string,
  data: {
    leadName?: string;
    leadEmail?: string;
    leadCompany?: string;
    catalogName?: string;
    docLink?: string;
    eventName?: string;
    stallName?: string;
  }
): string => {
  let processed = template;

  if (data.leadName) processed = processed.replace(/\{\{leadName\}\}/g, data.leadName);
  if (data.leadEmail) processed = processed.replace(/\{\{leadEmail\}\}/g, data.leadEmail);
  if (data.leadCompany) processed = processed.replace(/\{\{leadCompany\}\}/g, data.leadCompany);
  if (data.catalogName) processed = processed.replace(/\{\{catalogName\}\}/g, data.catalogName);
  if (data.docLink) processed = processed.replace(/\{\{docLink\}\}/g, data.docLink);
  if (data.eventName) processed = processed.replace(/\{\{eventName\}\}/g, data.eventName);
  if (data.stallName) processed = processed.replace(/\{\{stallName\}\}/g, data.stallName);

  return processed;
};

// Get available license keys for team manager (for assignment dropdown)
export const getAvailableLicenseKeysForAssignment = async (
  teamManagerId: string,
  catalogId?: string
) => {
  // Find all events with license keys assigned to this team manager
  const events = await EventModel.find({
    "licenseKeys.teamManagerId": new mongoose.Types.ObjectId(teamManagerId),
    isDeleted: false
  }).select("_id eventName licenseKeys");

  // Get already assigned license keys for this catalog (if catalogId provided)
  let assignedKeys = new Set<string>();
  if (catalogId) {
    const catalog = await CatalogModel.findOne({
      _id: new mongoose.Types.ObjectId(catalogId),
      teamManagerId: new mongoose.Types.ObjectId(teamManagerId),
      isDeleted: false
    });

    if (catalog) {
      catalog.assignedLicenseKeys.forEach((ak) => {
        assignedKeys.add(`${ak.eventId.toString()}-${ak.licenseKey}`);
      });
    }
  }

  // Build list of available license keys
  const availableKeys: {
    eventId: string;
    eventName: string;
    licenseKey: string;
    stallName: string;
    isAssigned: boolean;
  }[] = [];

  events.forEach((event) => {
    event.licenseKeys.forEach((lk) => {
      if (lk.teamManagerId?.toString() === teamManagerId) {
        const keyIdentifier = `${event._id.toString()}-${lk.key}`;
        availableKeys.push({
          eventId: event._id.toString(),
          eventName: event.eventName,
          licenseKey: lk.key,
          stallName: lk.stallName || "",
          isAssigned: assignedKeys.has(keyIdentifier)
        });
      }
    });
  });

  return availableKeys;
};
