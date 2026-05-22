import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  getDashboardPreferences,
  saveDashboardPreferences,
} from "../controllers/userDashboardPreferences.controller";

const router = Router();

router.get("/dashboard-preferences", authenticateToken, getDashboardPreferences);
router.put("/dashboard-preferences", authenticateToken, saveDashboardPreferences);

export default router;
