// Get all meetings for team manager's team members (for leads captured in their managed events)
import { getTeamMeetings } from "../controllers/teamManager.controller";
import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import {
  getDashboardStats,
  getLeadsGraph,
  getTeamMembers,
  getMyEvents,
  getMemberLeads,
  getAllLeadsForManager,
  getAllLicenseKeys,
  revokeEventAccess,
  restoreEventAccess,
  getTeamMemberEvents,
} from "../controllers/teamManager.controller";
import {
  adminDashboardLimiter,
  adminLimiter
} from "../middleware/rateLimiter.middleware";

const router = Router();

// All routes require TEAMMANAGER role
// Dashboard routes - High limit for frequent polling (500/min per user)
router.get("/dashboard/stats", authenticateToken, authorizeRoles("TEAMMANAGER"), adminDashboardLimiter, getDashboardStats);
router.get("/leads/graph", authenticateToken, authorizeRoles("TEAMMANAGER"), adminDashboardLimiter, getLeadsGraph);

// Other routes - Admin limit (300/min per user)
router.get("/leads", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getAllLeadsForManager);
router.get("/team/members", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getTeamMembers);
router.get("/team/member/:memberId/leads", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getMemberLeads);
router.get("/team/member/:memberId/events", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter,  getTeamMemberEvents);
router.patch("/team/member/:memberId/revoke-access", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter,  revokeEventAccess);
router.patch("/team/member/:memberId/restore-access", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter,  restoreEventAccess);
router.get("/events", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getMyEvents);
router.get("/meetings/team", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getTeamMeetings);
router.get("/license-keys", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getAllLicenseKeys);

export default router;
