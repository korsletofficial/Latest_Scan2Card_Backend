# Notification API Documentation

## Overview

The Notification API provides endpoints for managing user notifications in the Scan2Card application. Notifications are stored in the database and can also be sent as push notifications via Firebase Cloud Messaging (FCM).

**Base URL:** `/api/notifications`

**Authentication:** All endpoints require Bearer token authentication.

---

## Notification Types

- `meeting_reminder` - Reminders for upcoming meetings
- `license_expiry` - License expiration warnings
- `lead_update` - Updates about leads
- `team_update` - Team-related notifications
- `event_update` - Event-related notifications
- `system` - System notifications

---

## Endpoints

### 1. Get All Notifications

Get a paginated list of notifications for the authenticated user.

**Endpoint:** `GET /api/notifications`

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 20, max: 100)
- `type` (optional) - Filter by notification type
- `isRead` (optional) - Filter by read status (true/false)
- `priority` (optional) - Filter by priority (low/medium/high)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "notification_id",
      "userId": "user_id",
      "type": "meeting_reminder",
      "title": "Meeting Reminder",
      "message": "Your meeting 'Client Discussion' with John Doe starts in 60 minutes",
      "data": {
        "meetingId": "meeting_id",
        "leadName": "John Doe",
        "startAt": "2025-12-17T14:00:00.000Z"
      },
      "priority": "high",
      "isRead": false,
      "readAt": null,
      "actionUrl": "/meetings/meeting_id",
      "isDeleted": false,
      "createdAt": "2025-12-17T13:00:00.000Z",
      "updatedAt": "2025-12-17T13:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "unreadCount": 12
}
```

**Example Requests:**
```bash
# Get first page of all notifications
curl -X GET "http://localhost:5000/api/notifications" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get only unread notifications
curl -X GET "http://localhost:5000/api/notifications?isRead=false" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get meeting reminders only
curl -X GET "http://localhost:5000/api/notifications?type=meeting_reminder" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get high priority notifications
curl -X GET "http://localhost:5000/api/notifications?priority=high&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2. Get Unread Count

Get the count of unread notifications for the authenticated user.

**Endpoint:** `GET /api/notifications/unread-count`

**Response:**
```json
{
  "success": true,
  "data": {
    "unreadCount": 12
  }
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:5000/api/notifications/unread-count" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3. Mark Notifications as Read

Mark one or more specific notifications as read.

**Endpoint:** `PATCH /api/notifications/mark-as-read`

**Request Body:**
```json
{
  "notificationIds": ["notification_id_1", "notification_id_2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "2 notification(s) marked as read",
  "data": {
    "count": 2
  }
}
```

**Example Request:**
```bash
curl -X PATCH "http://localhost:5000/api/notifications/mark-as-read" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationIds": ["675f1234567890abcdef1234", "675f1234567890abcdef5678"]
  }'
```

---

### 4. Mark All Notifications as Read

Mark all unread notifications as read for the authenticated user.

**Endpoint:** `PATCH /api/notifications/mark-all-as-read`

**Response:**
```json
{
  "success": true,
  "message": "12 notification(s) marked as read",
  "data": {
    "count": 12
  }
}
```

**Example Request:**
```bash
curl -X PATCH "http://localhost:5000/api/notifications/mark-all-as-read" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 5. Delete Notifications

Soft delete one or more notifications.

**Endpoint:** `DELETE /api/notifications`

**Request Body:**
```json
{
  "notificationIds": ["notification_id_1", "notification_id_2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "2 notification(s) deleted",
  "data": {
    "count": 2
  }
}
```

**Example Request:**
```bash
curl -X DELETE "http://localhost:5000/api/notifications" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationIds": ["675f1234567890abcdef1234", "675f1234567890abcdef5678"]
  }'
```

---

## FCM Token Management (Push Notifications)

### 6. Register FCM Token

Register a Firebase Cloud Messaging token for push notifications.

**Endpoint:** `POST /api/notifications/register-token`

**Request Body:**
```json
{
  "fcmToken": "FCM_DEVICE_TOKEN_STRING"
}
```

**Response:**
```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/notifications/register-token" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg"
  }'
```

---

### 7. Remove FCM Token

Remove a previously registered FCM token (e.g., when user uninstalls the app or logs out from a specific device).

**Endpoint:** `POST /api/notifications/remove-token`

**Request Body:**
```json
{
  "fcmToken": "FCM_DEVICE_TOKEN_STRING"
}
```

**Response:**
```json
{
  "success": true,
  "message": "FCM token removed successfully"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/notifications/remove-token" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg"
  }'
```

**Note:** When a user logs out using `/api/auth/logout`, all FCM tokens are automatically cleared. You don't need to manually call this endpoint on logout.

---

### 8. Get FCM Tokens

Get all registered FCM tokens for the authenticated user.

**Endpoint:** `GET /api/notifications/tokens`

**Response:**
```json
{
  "success": true,
  "data": {
    "fcmTokens": [
      "fcm_token_1",
      "fcm_token_2"
    ],
    "count": 2
  }
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:5000/api/notifications/tokens" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 9. Send Test Notification (Debug)

Send a test push notification to verify FCM setup.

**Endpoint:** `POST /api/notifications/test`

**Response:**
```json
{
  "success": true,
  "message": "Test notification sent successfully"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/notifications/test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Automated Notifications

### Meeting Reminders

Meeting reminder notifications are automatically created by a cron job that runs every 15 minutes. Reminders are sent 1 hour before a meeting starts.

**Trigger Conditions:**
- Meeting starts within 60 minutes
- Meeting status is "scheduled"
- `notifyAttendees` is enabled
- Reminder not already sent

**Notification Details:**
- **Type:** `meeting_reminder`
- **Priority:** `high`
- **Title:** "Meeting Reminder"
- **Message:** "Your meeting '[title]' with [lead name] starts in [X] minutes"
- **Action URL:** `/meetings/{meetingId}`

---

### License Expiry Reminders

License expiry notifications are automatically created by a cron job that runs daily at 9 AM.

**Reminder Schedule:**
- 30 days before expiry
- 7 days before expiry
- 3 days before expiry
- 1 day before expiry
- On expiry day

**Notification Details:**
- **Type:** `license_expiry`
- **Priority:** `high` (if ≤7 days), `medium` (otherwise)
- **Title:** "License Expiring Soon!" or "License Expiry Reminder"
- **Message:** "Your license will expire in [X] days. Please renew to continue using all features."
- **Action URL:** `/profile/license`

---

## Database Schema

```typescript
{
  userId: ObjectId,              // Reference to User
  type: string,                  // Notification type (enum)
  title: string,                 // Notification title
  message: string,               // Notification message
  data: object,                  // Additional data (flexible)
  priority: string,              // low | medium | high
  isRead: boolean,               // Read status
  readAt: Date,                  // When notification was read
  actionUrl: string,             // Deep link or URL
  expiresAt: Date,               // Auto-deletion date (optional)
  isDeleted: boolean,            // Soft delete flag
  createdAt: Date,               // Auto-generated
  updatedAt: Date                // Auto-generated
}
```

---

## Frontend Integration Example

### React/TypeScript Example

```typescript
// Fetch notifications
const fetchNotifications = async (page = 1, limit = 20) => {
  try {
    const response = await axios.get('/api/notifications', {
      params: { page, limit },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
  }
};

// Get unread count
const getUnreadCount = async () => {
  try {
    const response = await axios.get('/api/notifications/unread-count', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return response.data.data.unreadCount;
  } catch (error) {
    console.error('Failed to get unread count:', error);
  }
};

// Mark as read
const markAsRead = async (notificationIds: string[]) => {
  try {
    await axios.patch('/api/notifications/mark-as-read',
      { notificationIds },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
  } catch (error) {
    console.error('Failed to mark as read:', error);
  }
};

// Mark all as read
const markAllAsRead = async () => {
  try {
    await axios.patch('/api/notifications/mark-all-as-read', null, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error('Failed to mark all as read:', error);
  }
};
```

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Best Practices

1. **Polling for new notifications**: Poll the unread count endpoint every 30-60 seconds
2. **Pagination**: Use reasonable page sizes (10-50 items)
3. **Mark as read**: Mark notifications as read when user views them
4. **Delete old notifications**: Periodically delete read notifications older than 30 days
5. **FCM tokens**:
   - Register token on app launch or login
   - Tokens are automatically cleared on logout - no manual removal needed
   - Only manually remove tokens when uninstalling app or switching devices
6. **Action URLs**: Navigate to the appropriate screen when user taps a notification

---

## Testing with Postman

1. Import the Postman collection: `Scan2Card_API_Collection.postman_collection.json`
2. Set the `token` variable with your authentication token
3. Test each endpoint in the Notifications folder
4. Use the test notification endpoint to verify FCM setup

---

## Cron Job Configuration

Both cron jobs are automatically started when the server starts. To manually trigger:

```typescript
// In your code
import { checkAndSendMeetingReminders } from './cron/meetingReminders';
import { checkAndSendLicenseExpiryReminders } from './cron/licenseExpiryReminders';

// Manually trigger meeting reminders
await checkAndSendMeetingReminders();

// Manually trigger license expiry reminders
await checkAndSendLicenseExpiryReminders();
```

---

## Support

For issues or questions, please contact the development team or file an issue in the project repository.
