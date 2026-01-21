# Calendar OAuth Integration - Proof of Work

## Overview

This document tracks the implementation of OAuth-based calendar integration for Google Calendar and Microsoft Outlook, enabling automatic video conferencing link generation (Google Meet / Microsoft Teams).

**Implementation Date**: January 21, 2026
**Status**: COMPLETED

---

## Problem Statement

When a Team Member schedules a meeting, the system needs to:
1. Create the meeting on the **Team Manager's** calendar (not the Team Member's)
2. The Team Manager **owns** the calendar event
3. Automatically generate **Google Meet** or **Microsoft Teams** video links
4. Block the Team Manager's availability
5. Send calendar invites from the Team Manager's account

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OAUTH FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Team Manager clicks "Connect Google Calendar"                    │
│                          ↓                                           │
│  2. Redirect to Google/Microsoft OAuth consent screen                │
│                          ↓                                           │
│  3. User grants calendar permissions                                 │
│                          ↓                                           │
│  4. OAuth callback with authorization code                           │
│                          ↓                                           │
│  5. Exchange code for access + refresh tokens                        │
│                          ↓                                           │
│  6. Store encrypted tokens in database                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    MEETING CREATION FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Team Member creates meeting in Scan2Card                         │
│                          ↓                                           │
│  2. System identifies Team Manager for this user                     │
│                          ↓                                           │
│  3. Check if Team Manager has calendar connected                     │
│                          ↓                                           │
│  4. If connected: Create event via Calendar API                      │
│     - Include conferenceData for Google Meet                         │
│     - Include isOnlineMeeting for Teams                              │
│                          ↓                                           │
│  5. Store video link and external event ID in Meeting                │
│                          ↓                                           │
│  6. Return meeting with video conferencing link                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Database Schema Updates
- [x] Update User model with calendar OAuth fields
- [x] Update Meeting model with video link and external calendar fields

### Phase 2: OAuth Services
- [x] Google Calendar OAuth service
- [x] Microsoft Outlook OAuth service
- [x] Token encryption/decryption utilities

### Phase 3: Calendar Event Services
- [x] Google Calendar event creation with Meet links
- [x] Microsoft Outlook event creation with Teams links
- [x] Unified calendar service interface

### Phase 4: API Endpoints
- [x] OAuth initiation endpoints
- [x] OAuth callback endpoints
- [x] Calendar disconnection endpoint
- [x] Calendar status endpoint

### Phase 5: Meeting Integration
- [x] Update meeting creation to sync with external calendars
- [x] Update meeting update to sync changes
- [x] Update meeting deletion to remove from calendars

---

## Files Created/Modified

### New Files Created
| File | Purpose | Status |
|------|---------|--------|
| `src/services/googleCalendar.service.ts` | Google Calendar OAuth & event management | ✅ Complete |
| `src/services/outlookCalendar.service.ts` | Microsoft Outlook OAuth & event management | ✅ Complete |
| `src/services/calendarIntegration.service.ts` | Unified calendar interface | ✅ Complete |
| `src/controllers/calendarOAuth.controller.ts` | OAuth flow controllers | ✅ Complete |
| `src/utils/encryption.util.ts` | Token encryption utilities | ✅ Complete |

### Modified Files
| File | Changes | Status |
|------|---------|--------|
| `src/models/user.model.ts` | Added calendar OAuth fields | ✅ Complete |
| `src/models/meeting.model.ts` | Added video link fields | ✅ Complete |
| `src/routes/calendar.routes.ts` | Added OAuth routes | ✅ Complete |
| `src/services/meeting.service.ts` | Integrated calendar sync | ✅ Complete |
| `.env.example` | Added OAuth credentials placeholders | ✅ Complete |

---

## API Endpoints

### OAuth Flow Endpoints

```
GET  /api/calendar/oauth/status          - Get integration status and available providers
GET  /api/calendar/oauth/google          - Initiate Google OAuth (returns authUrl)
GET  /api/calendar/oauth/google/callback - Google OAuth callback (public, handles redirect)
GET  /api/calendar/oauth/outlook         - Initiate Microsoft OAuth (returns authUrl)
GET  /api/calendar/oauth/outlook/callback- Microsoft OAuth callback (public, handles redirect)
DELETE /api/calendar/oauth/disconnect    - Disconnect calendar integration
```

### Existing Endpoints (Unchanged)
```
POST   /api/calendar/token   - Generate iCal feed token (fallback)
GET    /api/calendar/feed/:token - iCal feed (fallback)
DELETE /api/calendar/token   - Revoke iCal feed token
GET    /api/calendar/status  - Feed status
```

---

## Environment Variables Required

```bash
# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:5173

# Google Calendar OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar/oauth/google/callback

# Microsoft Outlook OAuth
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:5000/api/calendar/oauth/outlook/callback
MICROSOFT_TENANT_ID=common

# Token Encryption
CALENDAR_TOKEN_ENCRYPTION_KEY=32_character_encryption_key_here
```

---

## Detailed Implementation

### Step 1: User Model Updates
**Status**: ✅ COMPLETED

Added fields to store OAuth tokens and calendar provider info:

```typescript
// Fields added to User model (src/models/user.model.ts)
calendarProvider: "google" | "outlook" | null;  // Connected calendar provider
calendarAccessToken: string;      // Encrypted OAuth access token
calendarRefreshToken: string;     // Encrypted OAuth refresh token
calendarTokenExpiry: Date;        // Access token expiry time
calendarConnectedAt: Date;        // When the calendar was connected
calendarEmail: string;            // Email of connected calendar account
```

---

### Step 2: Meeting Model Updates
**Status**: ✅ COMPLETED

Added fields for video conferencing links and external calendar event IDs:

```typescript
// Fields added to Meeting model (src/models/meeting.model.ts)
videoConferenceLink: string;      // Auto-generated Google Meet or Teams link
videoConferenceProvider: "google_meet" | "teams" | null;
externalCalendarEventId: string;  // Event ID in external calendar (Google/Outlook)
externalCalendarProvider: "google" | "outlook" | null;
calendarSyncStatus: "pending" | "synced" | "failed" | "not_applicable";
calendarSyncError: string;        // Error message if sync failed
calendarSyncedAt: Date;           // Last successful sync time
```

---

### Step 3: Google Calendar OAuth Service
**Status**: ✅ COMPLETED

File: `src/services/googleCalendar.service.ts`

**Key Functions**:
- `getGoogleAuthUrl(state)` - Generate OAuth consent URL
- `exchangeCodeForTokens(code)` - Exchange authorization code for tokens
- `refreshGoogleAccessToken(refreshToken)` - Refresh expired access tokens
- `getAuthenticatedClient(userId)` - Get OAuth2 client for API calls
- `createGoogleCalendarEvent(userId, eventData)` - Create event with Google Meet link
- `updateGoogleCalendarEvent(userId, eventId, eventData)` - Update existing event
- `deleteGoogleCalendarEvent(userId, eventId)` - Delete event
- `cancelGoogleCalendarEvent(userId, eventId)` - Mark event as cancelled
- `revokeGoogleAccess(refreshToken)` - Revoke OAuth access

**Google Meet Link Generation**:
```typescript
// Conference data for Google Meet
conferenceData: {
  createRequest: {
    requestId: `meeting_${meetingId}_${Date.now()}`,
    conferenceSolutionKey: { type: "hangoutsMeet" }
  }
}
// Insert with conferenceDataVersion=1
```

---

### Step 4: Microsoft Outlook OAuth Service
**Status**: ✅ COMPLETED

File: `src/services/outlookCalendar.service.ts`

**Key Functions**:
- `getMicrosoftAuthUrl(state)` - Generate OAuth consent URL
- `exchangeMicrosoftCodeForTokens(code)` - Exchange authorization code for tokens
- `refreshMicrosoftAccessToken(refreshToken)` - Refresh expired access tokens
- `getValidAccessToken(userId)` - Get valid access token (auto-refresh)
- `createOutlookCalendarEvent(userId, eventData)` - Create event with Teams link
- `updateOutlookCalendarEvent(userId, eventId, eventData)` - Update existing event
- `deleteOutlookCalendarEvent(userId, eventId)` - Delete event
- `cancelOutlookCalendarEvent(userId, eventId)` - Cancel event

**Teams Meeting Link Generation**:
```typescript
// Event data for Teams meeting
{
  isOnlineMeeting: true,
  onlineMeetingProvider: "teamsForBusiness"
}
// Teams link returned in: response.onlineMeeting.joinUrl
```

---

### Step 5: Unified Calendar Integration Service
**Status**: ✅ COMPLETED

File: `src/services/calendarIntegration.service.ts`

**Key Functions**:
- `findTeamManagerForUser(endUserId, eventId)` - Find Team Manager with calendar connected
- `createCalendarEventForMeeting(endUserId, meetingData, eventId)` - Create event on Team Manager's calendar
- `updateCalendarEventForMeeting(meetingId, updates)` - Update calendar event
- `cancelCalendarEventForMeeting(meetingId)` - Cancel calendar event
- `deleteCalendarEventForMeeting(meetingId)` - Delete calendar event
- `getCalendarIntegrationStatus(userId)` - Get connection status
- `isAnyCalendarConfigured()` - Check if any provider is configured

---

### Step 6: Calendar OAuth Controller
**Status**: ✅ COMPLETED

File: `src/controllers/calendarOAuth.controller.ts`

**Endpoints**:
- `getOAuthStatus` - GET /api/calendar/oauth/status
- `initiateGoogleOAuth` - GET /api/calendar/oauth/google
- `handleGoogleCallback` - GET /api/calendar/oauth/google/callback
- `initiateMicrosoftOAuth` - GET /api/calendar/oauth/outlook
- `handleMicrosoftCallback` - GET /api/calendar/oauth/outlook/callback
- `disconnectCalendar` - DELETE /api/calendar/oauth/disconnect

---

### Step 7: Meeting Service Integration
**Status**: ✅ COMPLETED

File: `src/services/meeting.service.ts`

**Changes**:
- `createMeeting()` - Now syncs to Team Manager's calendar and gets video link
- `updateMeeting()` - Syncs changes to external calendar
- `deleteMeeting()` - Cancels event in external calendar

**Flow on Meeting Creation**:
1. Create meeting in database
2. Find Team Manager for the End User
3. Check if Team Manager has calendar connected
4. If connected, create event via Google/Outlook API
5. Store video link and external event ID
6. Return meeting with video conferencing link

---

## Security Considerations

1. **Token Encryption**: All OAuth tokens encrypted at rest using AES-256-GCM
2. **HTTPS Only**: All OAuth redirects use HTTPS in production
3. **Minimal Scopes**: Only request necessary calendar permissions
4. **Token Refresh**: Automatic refresh before expiry (5-minute buffer)
5. **Secure Storage**: Tokens stored in database with `select: false`
6. **Revocation**: Users can disconnect and revoke access anytime

---

## How to Set Up

### Google Calendar Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Go to Credentials > Create OAuth 2.0 Client ID
5. Application type: Web application
6. Add authorized redirect URI: `http://localhost:5000/api/calendar/oauth/google/callback`
7. Copy Client ID and Client Secret to `.env`

### Microsoft Outlook Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to Azure Active Directory > App registrations
3. Create new registration
4. Supported account types: Accounts in any organizational directory and personal Microsoft accounts
5. Redirect URI: Web - `http://localhost:5000/api/calendar/oauth/outlook/callback`
6. Go to Certificates & secrets > New client secret
7. Go to API permissions > Add:
   - Microsoft Graph > Delegated > Calendars.ReadWrite
   - Microsoft Graph > Delegated > OnlineMeetings.ReadWrite
   - Microsoft Graph > Delegated > User.Read
   - Microsoft Graph > Delegated > offline_access
8. Copy Application (client) ID and Client Secret to `.env`

---

## Usage Flow

### Team Manager Connects Calendar

```
1. Team Manager logs in to Scan2Card
2. Goes to Settings > Calendar Integration
3. Clicks "Connect Google Calendar" or "Connect Outlook"
4. Redirected to OAuth consent screen
5. Grants permissions
6. Redirected back to Scan2Card with success message
7. Calendar is now connected
```

### Team Member Schedules Meeting

```
1. Team Member scans a business card (creates lead)
2. Clicks "Schedule Meeting" for the lead
3. Fills in meeting details (title, time, mode: online)
4. Submits meeting
5. System automatically:
   - Creates meeting in database
   - Finds Team Manager with calendar connected
   - Creates event on Team Manager's Google/Outlook calendar
   - Generates Google Meet or Teams link
   - Stores video link in meeting
6. Team Member sees meeting with video link
7. Team Manager sees meeting in their calendar with video link
```

---

## Testing Checklist

- [ ] Google OAuth flow works end-to-end
- [ ] Microsoft OAuth flow works end-to-end
- [ ] Meeting creation generates Google Meet link
- [ ] Meeting creation generates Teams link
- [ ] Meeting update syncs to external calendar
- [ ] Meeting cancellation removes from external calendar
- [ ] Token refresh works when access token expires
- [ ] Disconnect removes tokens and revokes access
- [ ] Error handling for API failures
- [ ] Fallback to iCal feed when OAuth not connected

---

## Frontend Integration

### Phase 6: Team Manager Profile Page
- [x] Update calendar.api.ts with OAuth types and functions
- [x] Add OAuth state management in Profile.tsx
- [x] Handle OAuth callback from URL params
- [x] Create connect/disconnect handlers
- [x] Build Calendar Integration UI (primary)
- [x] Keep iCal Feed UI (fallback)

### Frontend Files Modified

| File | Changes | Status |
|------|---------|--------|
| `Frontend/src/api/calendar.api.ts` | Added OAuth types and API functions | ✅ Complete |
| `Frontend/src/pages/TeamManager/Profile.tsx` | Added OAuth integration in Calendar tab | ✅ Complete |

### Calendar Tab UI Features

**OAuth Integration Card (Primary)**:
- Shows "Connect Google Calendar" and "Connect Outlook Calendar" buttons when not connected
- Shows connected status with provider logo, email, and connection date when connected
- Lists benefits: auto-sync meetings, video link generation, availability blocking, calendar invites
- Disconnect button with confirmation

**iCal Feed Card (Fallback)**:
- Read-only calendar subscription option
- Feed URL and Webcal URL for different calendar apps
- Note that this doesn't support video link generation

### OAuth Callback Flow

1. User clicks "Connect Google Calendar" or "Connect Outlook Calendar"
2. Frontend calls `/api/calendar/oauth/google` or `/api/calendar/oauth/outlook`
3. Backend returns OAuth consent URL
4. Frontend redirects user to Google/Microsoft OAuth consent screen
5. User grants permissions
6. OAuth provider redirects to backend callback URL
7. Backend exchanges code for tokens, stores encrypted tokens
8. Backend redirects to frontend with `?success=true&provider=google` or `?error=...`
9. Frontend Profile page reads URL params, shows success/error message
10. Frontend fetches updated OAuth status to show connected state

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-21 | Initial documentation created | Claude |
| 2026-01-21 | Backend implementation completed | Claude |
| 2026-01-21 | Frontend integration completed | Claude |

---

## Summary

The calendar OAuth integration is now complete. Here's what was implemented:

| Feature | Status |
|---------|--------|
| Google Calendar OAuth | ✅ Implemented |
| Microsoft Outlook OAuth | ✅ Implemented |
| Google Meet auto-generation | ✅ Implemented |
| Teams Meet auto-generation | ✅ Implemented |
| Token encryption | ✅ Implemented |
| Auto token refresh | ✅ Implemented |
| Meeting sync on create | ✅ Implemented |
| Meeting sync on update | ✅ Implemented |
| Meeting sync on delete | ✅ Implemented |
| Disconnect functionality | ✅ Implemented |
| iCal feed fallback | ✅ Already existed |
| **Frontend - Calendar API** | ✅ Implemented |
| **Frontend - Profile Page UI** | ✅ Implemented |
| **Frontend - OAuth Callback Handling** | ✅ Implemented |

The system now supports both Google Calendar and Microsoft Outlook integration. When a Team Manager connects their calendar, all meetings scheduled by their Team Members will automatically appear on the Team Manager's calendar with video conferencing links (Google Meet or Microsoft Teams) auto-generated.
