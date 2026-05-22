# Analytics API Reference

All endpoints require `Authorization: Bearer <token>` header.  
All responses follow the shape `{ success, message, data }`.

---

## Super Admin Analytics

Base prefix: `/api/admin`  
Role required: `SUPERADMIN`

---

### 1. Platform Conversion Funnel

```
GET /api/admin/dashboard/analytics/conversion-funnel
```

**What it shows:** How many license keys were issued → activated → captured leads. The platform's core health funnel.

**Response shape:**
```json
{
  "funnel": [
    { "step": "Keys Issued",      "count": 120, "dropOffPct": 100 },
    { "step": "Keys Activated",   "count": 80,  "dropOffPct": 66.67 },
    { "step": "Keys With Leads",  "count": 55,  "dropOffPct": 45.83 }
  ],
  "summary": {
    "totalKeysIssued": 120,
    "keysActivated": 80,
    "keysWithLeads": 55,
    "totalLeadCapacity": 120000,
    "totalLeadsCaptured": 4320,
    "overallLeadUtilizationPct": 3.6,
    "overallActivationUtilizationPct": 66.67
  }
}
```

**Chart:** Horizontal funnel chart. Steps on Y-axis, count as bar width. Show `dropOffPct` as label on each bar.

---

### 2. Exhibitor Retention & Churn

```
GET /api/admin/dashboard/analytics/exhibitor-retention?inactiveDays=30
```

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `inactiveDays` | number | 30 | Days without a new event to be considered at-risk |

**What it shows:** Active exhibitors vs at-risk (no event in N days) vs those who never created an event.

**Response shape:**
```json
{
  "summary": {
    "total": 50,
    "active": 30,
    "atRisk": 12,
    "neverCreatedEvent": 8,
    "inactiveDaysThreshold": 30,
    "retentionRatePct": 60.0
  },
  "atRisk": [
    {
      "userId": "...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@company.com",
      "companyName": "Acme",
      "lastEventAt": "2026-03-10T00:00:00.000Z",
      "totalEvents": 3,
      "daysSinceLastEvent": 72
    }
  ],
  "neverCreatedEvent": [
    {
      "userId": "...",
      "firstName": "Jane",
      "registeredAt": "2026-01-01T00:00:00.000Z",
      "daysSinceRegistration": 140
    }
  ]
}
```

**Chart:** Donut chart for `summary` (active / atRisk / neverCreatedEvent). Below it, a sortable table of `atRisk` list sorted by `daysSinceLastEvent` descending.

---

### 3. Expiring Keys With Low Utilization

```
GET /api/admin/dashboard/analytics/expiring-keys?days=14&utilizationThreshold=30
```

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `days` | number | 14 | Keys expiring within this many days |
| `utilizationThreshold` | number | 30 | Only return keys below this utilization % |

**What it shows:** Keys about to expire where the exhibitor has barely used their capacity — risk signal for renewal refusal.

**Response shape:**
```json
{
  "expiryWindowDays": 14,
  "utilizationThresholdPct": 30,
  "totalAtRisk": 7,
  "keys": [
    {
      "keyId": "...",
      "key": "ABCDE1234",
      "stallName": "Stall A",
      "eventName": "Tech Expo 2026",
      "exhibitor": { "name": "John Doe", "email": "...", "companyName": "..." },
      "expiresAt": "2026-05-28T00:00:00.000Z",
      "daysUntilExpiry": 7,
      "currentLeadCount": 12,
      "maxLeads": 200,
      "utilizationPct": 6.0
    }
  ]
}
```

**Chart:** Table with colored utilization badges (red < 10%, orange 10–30%). Sort by `daysUntilExpiry` ASC.

---

### 4. Platform Key Utilization

```
GET /api/admin/dashboard/analytics/key-utilization
```

**What it shows:** Aggregate platform-wide picture of how well license key capacity is being used.

**Response shape:**
```json
{
  "totalKeys": 200,
  "totalLeadCapacity": 2000000,
  "totalLeadsCaptured": 45000,
  "overallLeadUtilizationPct": 2.25,
  "totalActivationCapacity": 800,
  "totalActivationsUsed": 420,
  "overallActivationUtilizationPct": 52.5,
  "distribution": {
    "neverUsed": 30,
    "low": 95,
    "medium": 60,
    "high": 15
  }
}
```

**Chart:** Stacked bar or donut for `distribution`. Show `overallLeadUtilizationPct` and `overallActivationUtilizationPct` as stat cards above.

---

### 5. Geographic Distribution

```
GET /api/admin/dashboard/analytics/geographic
```

**What it shows:** Where events are happening (by city) and where exhibitors are from (by country).

**Response shape:**
```json
{
  "eventsByCity": [
    { "city": "Mumbai", "count": 14 },
    { "city": "Delhi", "count": 9 }
  ],
  "exhibitorsByCountry": [
    { "country": "India", "count": 30 },
    { "country": "USA", "count": 8 }
  ]
}
```

**Chart:** Two horizontal bar charts side by side. `eventsByCity` (top 20 cities), `exhibitorsByCountry` (top 20 countries). Bars sorted descending.

---

### 6. Exhibitor Time-to-First-Event

```
GET /api/admin/dashboard/analytics/time-to-first-event
```

**What it shows:** How long after registering does an exhibitor create their first event. High average = onboarding friction.

**Response shape:**
```json
{
  "summary": {
    "totalExhibitors": 50,
    "withEvents": 42,
    "neverCreatedEvent": 8,
    "avgDaysToFirstEvent": 11.4
  },
  "distribution": [
    { "range": "0-7d",  "count": 20 },
    { "range": "8-14d", "count": 10 },
    { "range": "15-30d","count": 8 },
    { "range": "31-60d","count": 3 },
    { "range": "60d+",  "count": 1 }
  ],
  "slowStarters": [
    {
      "userId": "...",
      "name": "John Doe",
      "registeredAt": "2026-01-01T00:00:00.000Z",
      "firstEventAt": "2026-03-15T00:00:00.000Z",
      "daysToFirstEvent": 73
    }
  ]
}
```

**Chart:** Bar chart for `distribution` (range on X-axis, count on Y-axis). Show `avgDaysToFirstEvent` as a stat card.

---

### 7. Event Type Distribution

```
GET /api/admin/dashboard/analytics/event-type-distribution
```

**What it shows:** Offline vs Online vs Hybrid events — what format dominates the platform.

**Response shape:**
```json
{
  "total": 80,
  "breakdown": [
    { "type": "Offline", "count": 55, "pct": 68.75, "avgLeadsPerEvent": 87.3 },
    { "type": "Online",  "count": 15, "pct": 18.75, "avgLeadsPerEvent": 31.2 },
    { "type": "Hybrid",  "count": 10, "pct": 12.5,  "avgLeadsPerEvent": 64.0 }
  ]
}
```

**Chart:** Donut chart for event count split. Below it, a bar chart comparing `avgLeadsPerEvent` across the three types.

---

### 8. Peak Platform Usage Hours

```
GET /api/admin/dashboard/analytics/peak-usage-hours?days=30
```

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `days` | number | all-time | Only count leads created in last N days |

**What it shows:** Hour-of-day heatmap of when leads are scanned across the entire platform.

**Response shape:**
```json
{
  "hours": [
    { "hour": 0,  "label": "12am", "count": 12 },
    { "hour": 10, "label": "10am", "count": 480 },
    { "hour": 11, "label": "11am", "count": 620 }
  ],
  "peakHour": { "hour": 11, "label": "11am", "count": 620 },
  "filterDays": 30
}
```

**Note:** Hour values are UTC. Apply the user's local timezone offset on the frontend before labeling the X-axis.

**Chart:** Bar chart with 24 bars (hours 0–23 on X-axis, lead count on Y-axis). Highlight peak bar. Optional: render as a heatmap grid.

---

---

## Exhibitor Analytics

Base prefix: `/api/events`  
Role required: `EXHIBITOR`

---

### 9. Lead Quality Analytics

```
GET /api/events/dashboard/lead-quality?eventId=<optional>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | No | Scope to a single event; omit for all events |

**What it shows:** Rating distribution (1–5 stars) per event and overall. Exposes which events generate high-quality leads vs volume noise.

**Response shape:**
```json
{
  "overall": {
    "totalLeads": 340,
    "ratedLeads": 210,
    "avgRating": 3.72,
    "distribution": { "1": 15, "2": 30, "3": 60, "4": 70, "5": 35 },
    "highQualityLeads": 105,
    "highQualityPct": 30.88
  },
  "events": [
    {
      "eventId": "...",
      "eventName": "Tech Summit",
      "totalLeads": 120,
      "ratedLeads": 80,
      "avgRating": 4.1,
      "highQualityLeads": 52,
      "highQualityPct": 43.33
    }
  ]
}
```

**Chart:** Stacked bar chart per event showing 1–5 star distribution. Stat cards for `avgRating` and `highQualityPct`.

---

### 10. Team Member Performance

```
GET /api/events/dashboard/team-performance?eventId=<optional>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | No | Scope to a single event; omit for all |

**What it shows:** Per team member: lead count, avg rating, high-quality leads, last activity. Identifies top performers and inactive members.

**Response shape:**
```json
{
  "members": [
    {
      "userId": "...",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "email": "rahul@...",
      "totalLeads": 45,
      "ratedLeads": 30,
      "avgRating": 4.2,
      "highQualityLeads": 20,
      "highQualityPct": 44.44,
      "lastActivityAt": "2026-05-21T10:30:00.000Z"
    }
  ],
  "summary": {
    "topPerformerByLeads": { "userId": "...", "name": "Rahul Sharma", "totalLeads": 45 },
    "topPerformerByQuality": { ... }
  }
}
```

**Chart:** Horizontal bar chart of members sorted by `totalLeads`. Secondary bar showing `avgRating`. Table below with all fields.

---

### 11. Meeting Conversion Analytics

```
GET /api/events/dashboard/meeting-conversion?eventId=<optional>
```

**What it shows:** How many leads converted into scheduled meetings — the link between scanning and selling.

**Response shape:**
```json
{
  "overall": {
    "totalLeads": 340,
    "leadsWithMeetings": 68,
    "conversionRatePct": 20.0,
    "meetingsByStatus": {
      "scheduled": 30,
      "completed": 25,
      "cancelled": 8,
      "rescheduled": 5
    }
  },
  "events": [
    {
      "eventId": "...",
      "eventName": "Tech Summit",
      "totalLeads": 120,
      "leadsWithMeetings": 35,
      "conversionRatePct": 29.17
    }
  ]
}
```

**Chart:** Funnel (leads → meetings). Donut for `meetingsByStatus`. Bar chart comparing `conversionRatePct` per event.

---

### 12. Duplicate Lead Detection

```
GET /api/events/dashboard/duplicate-leads?eventId=<optional>
```

**What it shows:** Same contact (by email or phone) captured at multiple stalls. Shows real unique reach vs inflated totals.

**Response shape:**
```json
{
  "totalLeads": 340,
  "duplicateGroups": 12,
  "duplicateLeadCount": 28,
  "duplicatePct": 8.24,
  "groups": [
    {
      "contactType": "email",
      "contact": "jane@example.com",
      "count": 3,
      "leads": [
        { "leadId": "...", "userId": "...", "eventId": "...", "name": "Jane Doe" }
      ]
    }
  ]
}
```

**Chart:** Stat card showing `duplicatePct`. List of duplicate groups with stall names. No complex chart needed — a callout banner if `duplicatePct > 10`.

---

### 13. Lead Capture Time-of-Day Heatmap

```
GET /api/events/dashboard/lead-capture-heatmap?eventId=<required>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | Yes | Event to analyze |

**What it shows:** When during the day leads are scanned most — helps exhibitors plan staff schedules.

**Response shape:**
```json
{
  "eventId": "...",
  "eventName": "Tech Summit",
  "heatmap": [
    { "hour": 0,  "label": "12am", "count": 0 },
    { "hour": 10, "label": "10am", "count": 45 },
    { "hour": 11, "label": "11am", "count": 72 }
  ],
  "peakHour": { "hour": 11, "label": "11am", "count": 72 },
  "dailyBreakdown": [
    { "date": "2026-05-10", "count": 120 },
    { "date": "2026-05-11", "count": 95 }
  ]
}
```

**Note:** Hour values are UTC. Apply the user's local timezone offset on the frontend before labeling the X-axis.

**Chart:** Bar chart (24 hours on X, count on Y). For multi-day events, show a secondary line chart for `dailyBreakdown`.

---

### 14. Event-to-Event Comparison

```
GET /api/events/dashboard/event-comparison?eventIds=id1,id2,id3
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventIds` | string | Yes | Comma-separated list of at least 2 event IDs |

**What it shows:** Side-by-side metrics for multiple events — leads, quality, meeting conversion, ROI.

**Response shape:**
```json
{
  "events": [
    {
      "eventId": "...",
      "eventName": "Tech Summit 2025",
      "type": "Offline",
      "startDate": "...",
      "endDate": "...",
      "durationDays": 2,
      "totalLeads": 200,
      "avgRating": 4.1,
      "highQualityLeads": 80,
      "highQualityPct": 40.0,
      "meetingsScheduled": 40,
      "meetingConversionPct": 20.0,
      "totalLeadCapacity": 1000,
      "totalLeadsCaptured": 200,
      "leadUtilizationPct": 20.0,
      "activeStalls": 4,
      "totalStalls": 5
    }
  ]
}
```

**Chart:** Grouped bar chart where each metric is a group and each event is a bar within that group. Alternatively a radar/spider chart per event.

---

### 15. Lead Demographics

```
GET /api/events/dashboard/lead-demographics?eventId=<optional>
```

**What it shows:** Breakdown of leads by job title, company, city, country, and scan type — audience intelligence.

**Response shape:**
```json
{
  "position": [
    { "value": "CTO",     "count": 32 },
    { "value": "Manager", "count": 25 }
  ],
  "company": [
    { "value": "Infosys", "count": 14 }
  ],
  "city": [
    { "value": "Mumbai",  "count": 55 }
  ],
  "country": [
    { "value": "India",   "count": 180 }
  ],
  "leadType": [
    { "value": "full_scan",  "count": 280 },
    { "value": "manual",     "count": 40 },
    { "value": "entry_code", "count": 20 }
  ]
}
```

**Chart:** Horizontal bar charts for `position`, `company`, `city` (top 10 each). Donut for `leadType` and `country`.

---

### 16. Expiring Keys Alert (Exhibitor)

```
GET /api/events/dashboard/expiring-keys-alert?days=7
```

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `days` | number | 7 | Keys expiring within this many days |

**What it shows:** Keys about to expire with remaining capacity — prompts exhibitor to push their team before quota is wasted.

**Response shape:**
```json
{
  "expiryWindowDays": 7,
  "totalAtRisk": 3,
  "keys": [
    {
      "key": "ABCDE1234",
      "stallName": "Stall A",
      "eventName": "Tech Summit",
      "expiresAt": "2026-05-24T18:29:59.999Z",
      "daysUntilExpiry": 3,
      "currentLeadCount": 20,
      "maxLeads": 200,
      "utilizationPct": 10.0,
      "remainingLeadCapacity": 180
    }
  ]
}
```

**Chart:** Alert banner/card list. Each key as a card with a progress bar showing `utilizationPct`. Red if `daysUntilExpiry <= 2`.

---

### 17. Stall Coverage by Day

```
GET /api/events/dashboard/stall-coverage-by-day?eventId=<required>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | Yes | Event to analyze |

**What it shows:** For each day of the event, how many leads did each stall capture. Identifies dead days and peak days per stall.

**Response shape:**
```json
{
  "eventId": "...",
  "eventName": "Tech Summit",
  "days": [
    {
      "date": "2026-05-10",
      "totalLeads": 95,
      "stalls": [
        { "key": "ABCDE1234", "stallName": "Stall A", "leadCount": 55 },
        { "key": "FGHIJ5678", "stallName": "Stall B", "leadCount": 40 }
      ]
    }
  ]
}
```

**Chart:** Grouped bar chart — each day is a group, each stall is a bar within the group. Or a stacked bar per day.

---

---

## Team Manager Analytics

Base prefix: `/api/team-manager`  
Role required: `TEAMMANAGER`

---

### 18. Member Performance Leaderboard

```
GET /api/team-manager/dashboard/member-leaderboard?eventId=<optional>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | No | Scope to a single event; omit for all managed events |

**What it shows:** Ranked list of team members by leads, quality, meeting conversion, and whether active today.

**Response shape:**
```json
{
  "members": [
    {
      "rank": 1,
      "userId": "...",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "email": "rahul@...",
      "totalLeads": 45,
      "avgRating": 4.2,
      "highQualityLeads": 20,
      "highQualityPct": 44.44,
      "meetingsScheduled": 12,
      "meetingConversionPct": 26.67,
      "lastActivityAt": "2026-05-21T10:30:00.000Z",
      "isActiveToday": true
    }
  ],
  "summary": {
    "topByLeads":    { "userId": "...", "name": "Rahul Sharma", "totalLeads": 45 },
    "topByQuality":  { ... },
    "topByMeetings": { ... }
  }
}
```

**Chart:** Ranked table with columns for all metrics. Highlight row if `isActiveToday = false`. Trophy icon for rank 1 in each category.

---

### 19. Active vs Inactive Members Today

```
GET /api/team-manager/dashboard/active-members?eventId=<optional>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | No | Filter to a specific event |

**What it shows:** Real-time during events — who scanned a lead today, who has been active in the last hour, who is silent.

**Response shape:**
```json
{
  "activeToday": 6,
  "inactiveToday": 2,
  "hotLastHour": 3,
  "members": [
    {
      "userId": "...",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "email": "rahul@...",
      "isActiveToday": true,
      "isHotLastHour": true,
      "leadsToday": 8,
      "lastActivityAt": "2026-05-21T10:45:00.000Z"
    }
  ]
}
```

**Chart:** Stat cards (activeToday / inactiveToday / hotLastHour). Below: member list with green/yellow/red status dots. Sort by `leadsToday` descending.

---

### 20. Meeting Outcome Analytics

```
GET /api/team-manager/dashboard/meeting-outcomes
```

**What it shows:** Are the meetings the team schedules actually happening? Completion rate, cancellation rate, avg time from lead to meeting.

**Response shape:**
```json
{
  "overall": {
    "totalMeetings": 60,
    "byStatus": {
      "scheduled": 15,
      "completed": 32,
      "cancelled": 8,
      "rescheduled": 5
    },
    "completionRate": 80.0,
    "avgHoursLeadToMeeting": 18.5
  },
  "perMember": [
    {
      "userId": "...",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "totalMeetings": 12,
      "completed": 9,
      "cancelled": 2,
      "completionRate": 81.82
    }
  ]
}
```

**Chart:** Donut for `byStatus`. Bar chart for `completionRate` per member. Stat card for `avgHoursLeadToMeeting`.

---

### 21. Duplicate Leads Within Team

```
GET /api/team-manager/dashboard/duplicate-leads?eventId=<optional>
```

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | No | Scope to a single event |

**What it shows:** Same contact scanned by multiple team members — prevents duplicate follow-ups and ownership conflicts.

**Response shape:**
```json
{
  "totalLeads": 220,
  "duplicateGroups": 8,
  "duplicateLeadCount": 18,
  "duplicatePct": 8.18,
  "groups": [
    {
      "contactType": "email",
      "contact": "jane@example.com",
      "count": 2,
      "capturedBy": [
        { "leadId": "...", "userId": "...", "eventId": "...", "name": "Jane Doe" }
      ]
    }
  ]
}
```

**Chart:** Warning banner if `duplicatePct > 5`. List of groups with member names who captured each duplicate.

---

### 22. Stall Underperformance Alerts

```
GET /api/team-manager/dashboard/stall-alerts
```

**What it shows:** During live events, stalls that are behind pace. Alert fires when a stall's utilization is less than half the event's elapsed time percentage.

**Logic:** If 50% of event has passed, stall should have ≥ 25% lead utilization. Below that = alert.

**Response shape:**
```json
{
  "totalAlerts": 2,
  "alerts": [
    {
      "eventId": "...",
      "eventName": "Tech Summit",
      "key": "ABCDE1234",
      "stallName": "Stall B",
      "email": "stallb@company.com",
      "eventElapsedPct": 60.0,
      "utilizationPct": 8.0,
      "expectedMinUtilizationPct": 30.0,
      "currentLeadCount": 16,
      "maxLeads": 200,
      "daysRemaining": 1
    }
  ]
}
```

**Chart:** Alert card list with a mini progress bar per stall showing `utilizationPct` vs `expectedMinUtilizationPct`. Red if below, amber if close.

---

### 23. License Key Time-to-First-Scan

```
GET /api/team-manager/dashboard/key-time-to-scan
```

**What it shows:** How long after a team member activates a key do they make their first scan. Measures onboarding speed in the field.

**Response shape:**
```json
{
  "summary": {
    "totalMembers": 12,
    "neverScanned": 2,
    "avgMinutesToFirstScan": 23.5,
    "slowStarters": 3
  },
  "keys": [
    {
      "key": "ABCDE1234",
      "stallName": "Stall A",
      "eventId": "...",
      "eventName": "Tech Summit",
      "totalMembers": 3,
      "members": [
        {
          "userId": "...",
          "firstName": "Rahul",
          "lastName": "Sharma",
          "activatedAt": "2026-05-10T09:00:00.000Z",
          "firstScanAt": "2026-05-10T09:18:00.000Z",
          "minutesToFirstScan": 18,
          "neverScanned": false
        }
      ]
    }
  ]
}
```

**Chart:** Bar chart of members by `minutesToFirstScan`. Highlight members where `neverScanned = true` in red. Stat card for `avgMinutesToFirstScan`.

---

## Quick Reference

| # | Endpoint | Role | Key Query Params |
|---|---|---|---|
| 1 | `GET /api/admin/dashboard/analytics/conversion-funnel` | SUPERADMIN | — |
| 2 | `GET /api/admin/dashboard/analytics/exhibitor-retention` | SUPERADMIN | `inactiveDays` |
| 3 | `GET /api/admin/dashboard/analytics/expiring-keys` | SUPERADMIN | `days`, `utilizationThreshold` |
| 4 | `GET /api/admin/dashboard/analytics/key-utilization` | SUPERADMIN | — |
| 5 | `GET /api/admin/dashboard/analytics/geographic` | SUPERADMIN | — |
| 6 | `GET /api/admin/dashboard/analytics/time-to-first-event` | SUPERADMIN | — |
| 7 | `GET /api/admin/dashboard/analytics/event-type-distribution` | SUPERADMIN | — |
| 8 | `GET /api/admin/dashboard/analytics/peak-usage-hours` | SUPERADMIN | `days` |
| 9 | `GET /api/events/dashboard/lead-quality` | EXHIBITOR | `eventId` |
| 10 | `GET /api/events/dashboard/team-performance` | EXHIBITOR | `eventId` |
| 11 | `GET /api/events/dashboard/meeting-conversion` | EXHIBITOR | `eventId` |
| 12 | `GET /api/events/dashboard/duplicate-leads` | EXHIBITOR | `eventId` |
| 13 | `GET /api/events/dashboard/lead-capture-heatmap` | EXHIBITOR | `eventId` (required) |
| 14 | `GET /api/events/dashboard/event-comparison` | EXHIBITOR | `eventIds` (required, comma-separated) |
| 15 | `GET /api/events/dashboard/lead-demographics` | EXHIBITOR | `eventId` |
| 16 | `GET /api/events/dashboard/expiring-keys-alert` | EXHIBITOR | `days` |
| 17 | `GET /api/events/dashboard/stall-coverage-by-day` | EXHIBITOR | `eventId` (required) |
| 18 | `GET /api/team-manager/dashboard/member-leaderboard` | TEAMMANAGER | `eventId` |
| 19 | `GET /api/team-manager/dashboard/active-members` | TEAMMANAGER | `eventId` |
| 20 | `GET /api/team-manager/dashboard/meeting-outcomes` | TEAMMANAGER | — |
| 21 | `GET /api/team-manager/dashboard/duplicate-leads` | TEAMMANAGER | `eventId` |
| 22 | `GET /api/team-manager/dashboard/stall-alerts` | TEAMMANAGER | — |
| 23 | `GET /api/team-manager/dashboard/key-time-to-scan` | TEAMMANAGER | — |
