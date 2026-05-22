# Scan2Card Backend — Complete Project Understanding

## What Is This?

Scan2Card is a **digital lead collection platform** for business events. Exhibitors and their field teams use it to scan business cards, QR codes, and manually enter contact details at trade shows, conferences, and other events. The backend is a **Node.js/Express + TypeScript + MongoDB** REST API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (TypeScript, compiled to ES2020) |
| Framework | Express 4.x |
| Database | MongoDB (via Mongoose 8.x) |
| Authentication | JWT (access + refresh tokens), bcrypt |
| File Storage | AWS S3 |
| OCR / Vision | MiniMax, Gemini, OpenAI (fallback chain) |
| Push Notifications | Firebase Cloud Messaging |
| Email | Nodemailer |
| SMS / OTP | TextPe / SmartPing |
| Calendar | Google Calendar API, Microsoft Outlook OAuth |
| CRM | Zoho CRM, Salesforce |
| QR Code | `qrcode` library |
| Rate Limiting | `express-rate-limit` |
| Validation | Zod + Mongoose built-in validators |
| Scheduling | `node-cron` |
| Web Scraping | Puppeteer + Browserless |

---

## Directory Structure

```
src/
├── server.ts                  # App bootstrap, middleware, route mounting, DB connect
├── config/
│   ├── db.config.ts           # MongoDB connection (pool size 10–100)
│   └── config.ts              # All env-var based config (keys, timeouts, flags)
├── models/                    # 15 Mongoose schemas
├── controllers/               # 18 Express route handlers
├── services/                  # 26 business-logic services
├── routes/                    # 17 route definition files
├── middleware/
│   ├── auth.middleware.ts     # JWT validation + role-based authorization
│   └── rateLimiter.middleware.ts   # Tiered rate limiting
├── helpers/
│   └── otp.helper.ts          # OTP generation + SMS/email dispatch
├── utils/
│   ├── sanitize.util.ts       # Strip empty strings from objects
│   ├── encryption.util.ts     # AES encryption for OAuth tokens at rest
│   ├── imageValidator.ts      # Format, size, dimension checks
│   └── dateRange.util.ts      # Timezone-aware date parsing
└── cron/                      # 5 scheduled background jobs
```

---

## Data Models (15 Schemas)

### Users & Roles

**User** — Central account. A single email can exist in multiple roles (enforced by compound index).

| Field | Notes |
|---|---|
| `role` | Ref to Role (`SUPERADMIN`, `EXHIBITOR`, `TEAMMANAGER`, `ENDUSER`) |
| `refreshTokens` | Array — supports multiple devices |
| `fcmTokens` | Firebase push notification tokens per device |
| `calendarFeedToken` | UUID for iCal subscription URL |
| `licenseKeys` | Keys this user has activated |
| `isVerified`, `isTwoFactorEnabled` | Auth flags |

**Role** — Seeded on startup. Four roles: `SUPERADMIN`, `EXHIBITOR`, `TEAMMANAGER`, `ENDUSER`.

**Team** — Belongs to a `TEAMMANAGER`, linked to an event. Holds an array of member user IDs.

---

### Events & Licensing

**Event** — Created by `EXHIBITOR`.

| Field | Notes |
|---|---|
| `type` | `Offline` / `Online` / `Hybrid` |
| `licenseKeys[]` | Each key has: `key`, `stallName`, `maxActivations`, `activatedCount`, `paymentStatus`, `expiresAt` |
| `isTrialEvent` | Restricts leads to 1000 max |
| `isExpired` | Auto-set by cron |

**RSVP** — Represents a user joining an event. Controls what that user can do.

| Field | Notes |
|---|---|
| `eventLicenseKey` | Which stall/key they used |
| `status` | `active` / `expired` / `revoked` |
| `meetingPermission` | Whether this user can create meetings |
| `calendarPermission` | Whether this user can sync calendars |
| `revokedBy`, `revocationReason` | Audit trail |
| `voluntarilyExited`, `exitedAt` | User-initiated exit |

---

### Lead Capture

**Lead** — Core entity. One lead = one scanned/entered contact.

| Field | Notes |
|---|---|
| `leadType` | `full_scan` / `entry_code` / `manual` |
| `images[]` | S3 URLs of card images (front/back) |
| `ocrText` | Raw OCR result |
| `details` | Structured: name, company, position, emails[], phones[], website, address |
| `notes` | `{ text, audioUrl }` |
| `rating` | 1–5 stars |
| `isDuplicate` | Set by duplicate-detection logic |
| `isIndependent` | Lead not tied to any event |

---

### Meetings

**Meeting** — Follow-up meeting scheduled with a lead contact.

| Field | Notes |
|---|---|
| `meetingMode` | `online` / `offline` / `phone` |
| `videoConferenceLink` | Google Meet / Teams URL |
| `googleCalendarEventId` | For sync/update/delete |
| `outlookCalendarEventId` | For sync/update/delete |
| `reminderSent` | Prevents duplicate cron reminders |

---

### Supporting Models

| Model | Purpose |
|---|---|
| **OTP** | Time-limited codes with TTL auto-delete. Purposes: `login`, `enable_2fa`, `disable_2fa`, `verification`, `forgot_password` |
| **Verification** | Tracks email/phone verification status |
| **TokenBlacklist** | Revoked JWTs. TTL-indexed so expired tokens auto-remove. Stores reason + IP + user-agent |
| **CrmToken** | Encrypted OAuth tokens for Zoho/Salesforce. One per user per provider |
| **Notification** | Push notification records. Auto-expire via TTL index |
| **Catalog** | Product/service files for sharing via WhatsApp or Email at events |
| **Feedback** | User-submitted bug reports / feature requests |
| **ContactUs** | Public contact form submissions |

---

## API Routes Reference

### Base: `/api`

| Prefix | Controller | Auth Required |
|---|---|---|
| `/auth` | auth.controller | No (most endpoints) |
| `/leads` | lead.controller | Yes |
| `/events` | event.controller | Yes |
| `/meetings` | meeting.controller | Yes |
| `/rsvp` | rsvp.controller | Yes |
| `/team-manager` | teamManager.controller | Yes (TEAMMANAGER+) |
| `/admin` | admin.controller | Yes (SUPERADMIN) |
| `/calendar` | calendar.controller | Yes |
| `/catalogs` | catalog.controller | Yes |
| `/profile` | profile.controller | Yes |
| `/notifications` | notification.controller | Yes |
| `/feedback` | feedback.controller | Yes |
| `/crm` | crm.controller | Yes |
| `/file-upload` | fileUpload.controller | Yes |
| `/invitations` | invitation.controller | Yes |

### Key Endpoints

**Auth flow:**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/send-verification-otp
POST /api/auth/verify-otp
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/refresh-token
POST /api/auth/logout
```

**Lead capture:**
```
POST /api/leads/scan-card      # Image upload → OCR → structured lead
POST /api/leads/scan-qr        # QR code → entry code / vCard
POST /api/leads                # Manual entry
GET  /api/leads                # Paginated list with filters
GET  /api/leads/export         # CSV/Excel download
GET  /api/leads/analytics      # Aggregated stats
```

**Event & license keys:**
```
POST /api/events
POST /api/events/:id/license-keys        # Single key
POST /api/events/:id/license-keys/bulk   # Bulk generate
PUT  /api/events/:id/license-keys/:keyId
GET  /api/events/dashboard/stats
GET  /api/events/dashboard/stall-performance
```

**Calendar:**
```
POST /api/calendar/oauth/google/initiate
GET  /api/calendar/oauth/google/callback
POST /api/calendar/oauth/outlook/initiate
GET  /api/calendar/oauth/outlook/callback
GET  /api/calendar/feed/:calendarFeedToken   # iCal subscription (no auth)
POST /api/calendar/disconnect
```

**Admin (SUPERADMIN only):**
```
POST /api/admin/exhibitors
GET  /api/admin/exhibitors
PUT  /api/admin/events/:eventId/keys/:keyId/payment-status
GET  /api/admin/dashboard/stats
GET  /api/admin/dashboard/trends/events
```

---

## Authentication & Authorization

### JWT Flow

```
Login → access token (24h) + refresh token (7d)
       ↓
Every request → Authorization: Bearer <access_token>
               ↓
Token expired → POST /api/auth/refresh-token  →  new access token
               ↓
Logout → token added to TokenBlacklist (TTL-indexed)
```

### Roles & Permissions

```
SUPERADMIN
  └── Full system access, manage exhibitors, view all analytics

EXHIBITOR
  └── Create/manage events, license keys, view own data

TEAMMANAGER
  └── Manage team members, control meeting/calendar permissions

ENDUSER
  └── Scan leads, create meetings, view own data
```

The `authorizeRoles(...roles)` middleware is stacked after `authenticateToken` on any protected route.

---

## Rate Limiting Strategy

Rate limiters key on **email/userId** for resource-specific limits AND **IP** for global abuse prevention. All thresholds are configurable via env vars.

| Tier | Operations | Limit |
|---|---|---|
| Auth (strict) | Register | 3/hour per email |
| Auth (strict) | Login fails | 10/15min per email |
| Auth (strict) | OTP send | 5/hour per email |
| Write (moderate) | Scan card | 150/min per user |
| Write (moderate) | Lead CRUD | 100/min per user |
| Write (moderate) | File upload | 20/5min per user |
| Read (standard) | GET requests | 200/min per user |
| Admin (elevated) | Admin ops | 300/min per user |
| Admin (elevated) | Dashboards | 500/min per user |
| Global (catch-all) | All | 5000/15min per IP |

Test accounts can be whitelisted to bypass limits.

---

## OCR Pipeline (Business Card Scanning)

```
Incoming image (S3 URL or base64)
        ↓
  ocrWithFallback.service.ts
        ↓
  1. Try MiniMax API  ──fail──▶  2. Try Gemini  ──fail──▶  3. Try OpenAI
        ↓ (success)
  Raw OCR text
        ↓
  businessCardScanner.service.ts
        ↓
  Parse into structured Lead.details:
    { firstName, lastName, company, position,
      emails[], phoneNumbers[], website, address }
        ↓
  Duplicate detection (scoped to event+user)
        ↓
  Save Lead document
```

Front + back images are combined before OCR. The fallback chain means a single provider outage doesn't break scanning.

---

## Calendar Integration

```
User initiates OAuth (Google or Outlook)
        ↓
OAuth callback → access token + refresh token
        ↓
Tokens encrypted (AES) → stored in CrmToken collection
        ↓
When a Meeting is created:
  calendarIntegration.service.ts
        ↓
  googleCalendar.service.ts  OR  outlookCalendar.service.ts
        ↓
  Create calendar event → store eventId on Meeting document
        ↓
  Meeting update/delete → sync to calendar

iCal Feed:
  GET /api/calendar/feed/:calendarFeedToken
  → Stream all meetings as .ics file (no auth, token in URL)
```

---

## CRM Integration

```
User connects Zoho or Salesforce via OAuth
        ↓
Tokens stored encrypted in CrmToken (unique per user+provider)
        ↓
Lead sync → zoho.service.ts / salesforce.service.ts
        ↓
Token refresh handled automatically before each API call
```

---

## Background Jobs (Cron)

| Job | Schedule | What it does |
|---|---|---|
| `serverActive` | Frequent | Pings server to prevent idle shutdown |
| `meetingReminders` | Frequent | FCM push for meetings starting soon |
| `licenseExpiryReminders` | Daily | Email/push for keys expiring soon |
| `eventExpiry` | Daily | Sets `isExpired=true` on past events, sends notifications |
| `rsvpExpiry` | Daily | Expires/revokes RSVPs past their `expiresAt` |

---

## File Uploads (AWS S3)

All binary assets go to S3. The `awsS3.service.ts` handles:

- **Business card images** — stored per lead
- **Audio notes** — attached to leads
- **Catalog files** — PDFs, images for product catalogs
- **CSV exports** — generated lead export files

Uploads go through `multer` (multipart/form-data) before being streamed to S3. Presigned URLs are used for client access.

---

## Environment Variables Quick Reference

```bash
# Server
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TOKEN_EXPIRES_IN=24h
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# OCR (fallback chain: MiniMax → Gemini → OpenAI)
MINIMAX_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=

# SMS
SMARTPING_APIKEY=
USE_DUMMY_OTP=false
DUMMY_OTP=123456

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET_NAME=

# Email (Nodemailer)
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=

# Firebase
FIREBASE_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_PATH=

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Microsoft Outlook
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=
MICROSOFT_TENANT_ID=

# Calendar token encryption
CALENDAR_TOKEN_ENCRYPTION_KEY=

# Zoho CRM
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REDIRECT_URI=

# Salesforce CRM
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
SALESFORCE_REDIRECT_URI=
```

---

## NPM Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with ts-node-dev (hot reload) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled production build |
| `npm run seed` | Seed default roles into DB |
| `npm run create:superadmin` | Interactive superadmin creation |
| `npm run qr` | Generate QR codes |
| `npm run lint` | ESLint check |

---

## Startup Sequence (`server.ts`)

```
1. Load .env
2. Create Express app
3. CORS (all origins allowed)
4. JSON body parser + compression
5. Mount rate limiters
6. Mount all /api/* routes
7. Health check GET /health
8. Connect to MongoDB → seed roles
9. Initialize Firebase Admin SDK
10. Start 5 cron jobs
11. Listen on PORT (default 5000)
```

---

## Key Design Patterns

- **Service/Controller separation** — Controllers validate & delegate; services own logic.
- **Soft deletes** — Most entities have `isDeleted` flag; hard deletes are rare.
- **TTL indexes** — OTP, TokenBlacklist, Notification auto-expire in MongoDB.
- **Compound indexes** — Email+role uniqueness; RSVP permission query optimization.
- **Fallback chains** — OCR providers fail gracefully to next provider.
- **Token encryption at rest** — All OAuth tokens (calendar, CRM) encrypted before storage.
- **Tiered rate limiting** — Different ceilings per operation type and identity dimension.
- **Multi-role accounts** — Same email can have separate EXHIBITOR and ENDUSER accounts.

---

## Common Development Tasks

**Add a new route:**
1. Create `src/routes/foo.routes.ts` — define Express Router
2. Create `src/controllers/foo.controller.ts` — request handling
3. Create `src/services/foo.service.ts` — business logic
4. Mount in `src/server.ts`: `app.use('/api/foo', fooRoutes)`

**Add a new model:**
1. Create `src/models/foo.model.ts` — Mongoose schema + interface
2. Import and use in the relevant service

**Run locally:**
```bash
cp .env.example .env   # Fill in values
npm install
npm run seed           # Seed roles
npm run dev            # Start dev server
```

**Check health:**
```
GET http://localhost:5000/health
```
