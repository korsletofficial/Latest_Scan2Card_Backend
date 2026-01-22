import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import { adminLimiter } from "../middleware/rateLimiter.middleware";
import {
  createCatalog,
  getCatalogs,
  getCatalogById,
  updateCatalog,
  deleteCatalog,
  assignCatalogToLicenseKeys,
  unassignCatalogFromLicenseKeys,
  getCatalogsForLicenseKey,
  getCatalogCategories,
  getCatalogStats,
  getAvailableLicenseKeys,
  previewTemplate
} from "../controllers/catalog.controller";

const router = Router();

// ==========================================
// TEAM MANAGER CATALOG ROUTES
// All routes require TEAMMANAGER role
// ==========================================

// Get catalog categories (available for dropdown)
router.get(
  "/categories",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  getCatalogCategories
);

// Get catalog stats for dashboard
router.get(
  "/stats",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  getCatalogStats
);

// Get available license keys for assignment dropdown
router.get(
  "/available-license-keys",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  getAvailableLicenseKeys
);

// Preview template with sample data
router.post(
  "/preview-template",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  previewTemplate
);

// CRUD operations
router.post(
  "/",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  createCatalog
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  getCatalogs
);

router.get(
  "/:catalogId",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  getCatalogById
);

router.put(
  "/:catalogId",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  updateCatalog
);

router.delete(
  "/:catalogId",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  deleteCatalog
);

// Assignment operations
router.post(
  "/:catalogId/assign",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  assignCatalogToLicenseKeys
);

router.post(
  "/:catalogId/unassign",
  authenticateToken,
  authorizeRoles("TEAMMANAGER"),
  adminLimiter,
  unassignCatalogFromLicenseKeys
);

// ==========================================
// ENDUSER ROUTES (for sending catalogs to leads)
// ==========================================

// Get catalogs for a specific license key (used when viewing lead details)
router.get(
  "/by-license-key/:licenseKey",
  authenticateToken,
  authorizeRoles("TEAMMANAGER", "ENDUSER"),
  adminLimiter,
  getCatalogsForLicenseKey
);

export default router;
