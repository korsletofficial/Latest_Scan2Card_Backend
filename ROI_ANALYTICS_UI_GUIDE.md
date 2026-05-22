# ROI Analytics — UI Integration Guide

This document describes both new analytics APIs, the shape of every field they return, and the recommended data visualization for each section of the dashboard.

---

## 1. Team Manager — License ROI

### Endpoint
```
GET /api/team-manager/dashboard/license-roi
Authorization: Bearer <TEAMMANAGER_JWT>
```

### Response shape
```jsonc
{
  "success": true,
  "message": "License ROI analytics retrieved successfully",
  "data": {
    "summary": {
      "totalLicenseKeys": 4,
      "totalLeadsGenerated": 180,
      "totalLeadsCapacity": 400,
      "totalActivationsUsed": 18,
      "totalActivationsCapacity": 40,
      "overallLeadUtilizationPct": 45,        // leads generated / max leads × 100
      "overallActivationUtilizationPct": 45,  // activations used / max activations × 100
      "overallROIScore": 45,                  // weighted score (leads 70%, activations 30%)
      "overallROIIndicator": "Medium",        // "High" ≥70 | "Medium" 30-69 | "Low" <30
      "breakdown": {
        "high": 1,
        "medium": 2,
        "low": 1
      }
    },
    "licenseKeys": [
      {
        "licenseKey": "SC-XXXX-XXXX",
        "stallName": "Booth A",
        "email": "manager@company.com",
        "eventId": "664abc...",
        "eventName": "Tech Expo 2025",
        "isExpired": false,
        "expiresAt": "2025-12-31T18:29:59.999Z",
        "isActive": true,
        "currentLeadCount": 70,
        "maxLeads": 100,
        "leadUtilizationPct": 70,
        "usedCount": 8,
        "maxActivations": 10,
        "activationUtilizationPct": 80,
        "roiScore": 73,                       // 0-100
        "roiIndicator": "High"
      }
      // … more license keys, sorted High → Medium → Low
    ]
  }
}
```

### Field reference

| Field | Type | Meaning |
|-------|------|---------|
| `overallROIIndicator` | `"High"\|"Medium"\|"Low"` | Team manager's overall performance label |
| `overallROIScore` | `0–100` | Composite score for a gauge/dial widget |
| `breakdown.high/medium/low` | `number` | Count of keys in each tier — drives a donut chart |
| `leadUtilizationPct` | `0–100` | Leads filled out of capacity — drives a progress bar |
| `activationUtilizationPct` | `0–100` | Team seats used out of max — drives a progress bar |
| `roiScore` | `0–100` | Per-key composite score |
| `roiIndicator` | `"High"\|"Medium"\|"Low"` | Colour-coded badge per row |

---

### Visualization map — Team Manager Dashboard

#### A. Overall ROI Gauge (top of page)
- **Widget:** Semicircular gauge / speedometer
- **Value:** `summary.overallROIScore` (0–100)
- **Colour zones:** 0–29 = red, 30–69 = amber, 70–100 = green
- **Label below:** `summary.overallROIIndicator`

```
  ┌──────────────────────────┐
  │   ●──── ROI Score ────●  │
  │         45 / 100         │
  │         [Medium]         │
  └──────────────────────────┘
```

#### B. License Key Tier Donut Chart
- **Widget:** Doughnut / pie chart (3 segments)
- **Data:**
  - `breakdown.high` → green segment
  - `breakdown.medium` → amber segment
  - `breakdown.low` → red segment
- **Center label:** total keys (`summary.totalLicenseKeys`)

```
      ┌─────────┐
      │  1 High │  Green
      │ 2 Med   │  Amber
      │  1 Low  │  Red
      └─────────┘
```

#### C. Lead vs Activation Capacity Bar (summary)
- **Widget:** Grouped horizontal bar chart (2 bars side by side)
- **Bar 1:** Lead utilization — `overallLeadUtilizationPct`
- **Bar 2:** Activation utilization — `overallActivationUtilizationPct`
- Shows aggregate capacity usage at a glance

#### D. License Key ROI Table (detail rows)
- **Widget:** Sortable data table — one row per license key
- **Columns:**

| Column | Source field | Render |
|--------|-------------|--------|
| Stall / Key | `stallName` or `licenseKey` | Text |
| Event | `eventName` | Text link |
| ROI | `roiIndicator` | Colour badge: green/amber/red |
| Score | `roiScore` | `XX / 100` |
| Leads | `currentLeadCount / maxLeads` | `70 / 100` + mini progress bar |
| Lead Fill % | `leadUtilizationPct` | Progress bar |
| Seats Used | `usedCount / maxActivations` | `8 / 10` + mini progress bar |
| Status | `isActive`, `isExpired` | Badge |
| Expires | `expiresAt` | Formatted date |

- Default sort: High → Medium → Low (already provided by API)
- Allow re-sort by `roiScore`, `leadUtilizationPct`, `eventName`

#### E. Per-Key Lead Progress Bar (card view alternative)
- **Widget:** Card grid, one card per license key
- Each card shows:
  - Badge: `roiIndicator` colour
  - Title: `stallName` + `eventName`
  - Progress bar: `leadUtilizationPct` (label: `currentLeadCount / maxLeads leads`)
  - Progress bar: `activationUtilizationPct` (label: `usedCount / maxActivations seats`)
  - Expiry chip: expired if `isExpired === true`

---

## 2. Exhibitor — Event ROI

### Endpoint
```
GET /api/events/dashboard/event-roi
Authorization: Bearer <EXHIBITOR_JWT>
```

### Response shape
```jsonc
{
  "success": true,
  "message": "Event ROI analytics retrieved successfully",
  "data": {
    "summary": {
      "totalEvents": 5,
      "totalLeadsGenerated": 430,
      "totalLeadsCapacity": 1000,
      "totalActivationsUsed": 55,
      "totalActivationsCapacity": 120,
      "overallLeadUtilizationPct": 43,
      "overallActivationUtilizationPct": 46,
      "overallROIScore": 44,
      "overallROIIndicator": "Medium",
      "breakdown": { "high": 1, "medium": 3, "low": 1 },
      "quotaROI": {
        "licenseKeysUsed": 12,
        "licenseKeysMax": 20,
        "licenseKeyUtilizationPct": 60,       // how much of the quota is deployed
        "activationsUsed": 55,
        "activationsMax": 100,
        "activationUtilizationPct": 55,
        "quotaROIScore": 58,
        "quotaROIIndicator": "Medium"         // overall license quota efficiency
      }
    },
    "events": [
      {
        "eventId": "664abc...",
        "eventName": "Tech Expo 2025",
        "type": "Offline",
        "startDate": "2025-11-01T00:00:00.000Z",
        "endDate": "2025-11-03T00:00:00.000Z",
        "isActive": true,
        "isExpired": false,
        "totalLicenseKeys": 6,
        "activeLicenseKeys": 5,
        "keyActivationRatePct": 83,
        "totalLeadsGenerated": 180,
        "totalLeadsCapacity": 300,
        "leadUtilizationPct": 60,
        "totalActivationsUsed": 22,
        "totalActivationsCapacity": 40,
        "activationUtilizationPct": 55,
        "roiScore": 59,
        "roiIndicator": "Medium",
        "licenseKeys": [
          {
            "licenseKey": "SC-XXXX-XXXX",
            "stallName": "Booth A",
            "email": "mgr@co.com",
            "isActive": true,
            "isExpired": false,
            "expiresAt": "2025-11-03T18:29:59.999Z",
            "currentLeadCount": 70,
            "maxLeads": 100,
            "leadUtilizationPct": 70,
            "usedCount": 8,
            "maxActivations": 10,
            "activationUtilizationPct": 80,
            "roiScore": 73,
            "roiIndicator": "High"
          }
          // … more keys
        ]
      }
      // … more events, sorted High → Medium → Low
    ]
  }
}
```

### Field reference

| Field | Type | Meaning |
|-------|------|---------|
| `overallROIIndicator` | `"High"\|"Medium"\|"Low"` | Exhibitor-wide performance label |
| `overallROIScore` | `0–100` | Composite score across all events |
| `breakdown` | `{high,medium,low}` | Event count per tier |
| `quotaROI.licenseKeyUtilizationPct` | `0–100` | % of quota deployed as license keys |
| `quotaROI.activationUtilizationPct` | `0–100` | % of activation quota consumed |
| `quotaROI.quotaROIIndicator` | `"High"\|"Medium"\|"Low"` | Quota efficiency label |
| `event.leadUtilizationPct` | `0–100` | Per-event lead fill rate |
| `event.keyActivationRatePct` | `0–100` | Active keys / total keys |
| `event.roiIndicator` | `"High"\|"Medium"\|"Low"` | Per-event colour badge |
| `licenseKeys[].roiIndicator` | `"High"\|"Medium"\|"Low"` | Per-key badge inside event drill-down |

---

### Visualization map — Exhibitor Dashboard

#### A. Overall ROI Gauge
- Same semicircular gauge as Team Manager
- Value: `summary.overallROIScore`
- Colour zones: 0–29 red, 30–69 amber, 70–100 green
- Label: `summary.overallROIIndicator`

#### B. Event Tier Donut Chart
- **Widget:** Doughnut chart (3 segments)
- `breakdown.high` → green, `breakdown.medium` → amber, `breakdown.low` → red
- Center label: `totalEvents`

#### C. Quota ROI Panel (unique to Exhibitor)
- **Widget:** Two-metric card with dual progress bars
- Progress bar 1: `quotaROI.licenseKeyUtilizationPct`
  - Label: `"License Keys: 12 / 20 used"`
- Progress bar 2: `quotaROI.activationUtilizationPct`
  - Label: `"Activations: 55 / 100 used"`
- ROI badge: `quotaROI.quotaROIIndicator`

```
  ┌──────────────────────────────────────┐
  │  Quota ROI           [Medium]        │
  │  License Keys  ████████░░  60%       │
  │                12 / 20 used          │
  │  Activations   ██████░░░░  55%       │
  │                55 / 100 used         │
  └──────────────────────────────────────┘
```

#### D. Event ROI Bar Chart (horizontal)
- **Widget:** Horizontal bar chart — one bar per event
- X-axis: `leadUtilizationPct` (0–100%)
- Each bar labelled with `eventName`
- Bar colour: green if High, amber if Medium, red if Low
- Tooltip shows: leads generated, capacity, ROI score, activation %
- Sorted: High → Medium → Low (API already provides this order)

```
  Tech Expo 2025  ████████████████░░░░  80%  [High]
  Health Summit   ████████░░░░░░░░░░░░  42%  [Medium]
  Startup Conf    ███░░░░░░░░░░░░░░░░░  18%  [Low]
```

#### E. Event ROI Cards (collapsible list)
- **Widget:** Accordion / expandable card list
- **Card header** (always visible):
  - Event name + type badge (Offline / Online / Hybrid)
  - ROI badge: colour-coded `roiIndicator`
  - Lead fill mini progress bar: `leadUtilizationPct`
  - Key activation chip: `keyActivationRatePct`% keys active
  - Status chips: Active / Expired
- **Expanded detail** (drill-down):
  - Inner table of `licenseKeys[]` with same columns as Team Manager table
  - Each key row shows per-key ROI badge, lead fill bar, activation bar

#### F. Lead vs Activation Scatter Plot (optional advanced view)
- **Widget:** Scatter / bubble chart
- X-axis: `leadUtilizationPct` per event
- Y-axis: `activationUtilizationPct` per event
- Bubble size: `totalLicenseKeys`
- Colour: `roiIndicator` (green/amber/red)
- Quadrant labels:
  - Top-right → "Full Utilization" (High ROI zone)
  - Bottom-left → "Under-utilized"
  - Top-left → "High Activations, Low Leads"
  - Bottom-right → "Leads without Seats"
- Ideal position: top-right quadrant

---

## 3. Colour Coding Reference (use consistently across all widgets)

| ROI Indicator | Hex colour | Tailwind class |
|---------------|-----------|----------------|
| High | `#22c55e` | `text-green-500` / `bg-green-100` |
| Medium | `#f59e0b` | `text-amber-500` / `bg-amber-100` |
| Low | `#ef4444` | `text-red-500` / `bg-red-100` |

---

## 4. ROI Score Formula (for frontend documentation)

```
leadUtilization       = currentLeadCount / maxLeads
activationUtilization = usedCount / maxActivations

roiScore = (leadUtilization × 0.70) + (activationUtilization × 0.30)
         = value between 0.0 and 1.0
         × 100 → integer percentage

roiIndicator:
  roiScore ≥ 70  → "High"
  roiScore ≥ 30  → "Medium"
  roiScore  < 30 → "Low"
```

> **Why 70/30 weighting?** Leads are the primary value indicator (you scan a card = lead generated). Activations measure seat efficiency but a low-activation key can still generate many leads if one person uses it heavily, so it gets less weight.

---

## 5. Quick Integration Checklist

- [ ] Call `GET /dashboard/license-roi` on Team Manager dashboard mount
- [ ] Call `GET /dashboard/event-roi` on Exhibitor dashboard mount
- [ ] Render Overall ROI Gauge using `summary.overallROIScore`
- [ ] Render Donut Chart using `summary.breakdown`
- [ ] Render Quota ROI panel (Exhibitor only) using `summary.quotaROI`
- [ ] Render per-event/per-key table with colour-coded `roiIndicator` badges
- [ ] Show lead fill progress bars using `leadUtilizationPct`
- [ ] Show activation fill progress bars using `activationUtilizationPct`
- [ ] Mark expired keys/events using `isExpired === true` (grey out row)
