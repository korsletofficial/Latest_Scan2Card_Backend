# Create Lead API - Duplicate Detection Update

## New Parameter: `allowDuplicate`

### Request Body (multipart/form-data)
Add the following parameter to the Create Lead API:

```
allowDuplicate (optional, boolean): Skip duplicate lead detection
- Default: false
- Set to true to bypass duplicate checking and force lead creation
```

### Full Request Parameters

- `eventId` (optional): Event ID to associate lead with
- `isIndependentLead` (optional, boolean): Whether lead is independent of events
- `leadType` (required): Type of lead capture (`full_scan`, `entry_code`, `manual`)
- `entryCode` (optional): Entry code from organizational QR cards
- `ocrText` (optional): Extracted OCR text from card
- `details` (optional, JSON string): Contact information object
  - Available fields: firstName, lastName, company, position, **emails** (array), **phoneNumbers** (array), website, address, city, country
- `rating` (optional, number): Lead quality rating (1-5)
- `images` (optional, file[]): Business card images (max 3 images)
- **`allowDuplicate` (optional, boolean): Skip duplicate check (default: false)** ← NEW

### Duplicate Detection Scope

- **Checked**: Matching ANY **email** OR **phone number** OR **entryCode** within the same event
- **Not Checked**: Independent leads (always allowed)
- **Case Handling**: Email/phone/entryCode are trimmed and compared

---

## API Responses

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Lead created successfully",
  "data": {
    "_id": "694bb18dad852e282b899e29",
    "userId": "6943ce0c9f252b3848f5a63c",
    "eventId": "69400eb1de91baff6f375700",
    "leadType": "full_scan",
    "entryCode": "SAMPLE_ENTRY_CODE",
    "details": {
      "firstName": "John",
      "lastName": "Doe",
      "emails": [
        "john.doe@example.com",
        "john@work.com"
      ],
      "phoneNumbers": [
        "+1234567890",
        "+0987654321"
      ],
      "company": "Acme Corp"
    },
    "rating": 5,
    "createdAt": "2025-12-24T09:25:33.000Z"
  }
}
```

### Duplicate Detected Response (409 Conflict) ← NEW

When a duplicate is detected (matching any email/phone/entryCode in the event):

```json
{
  "success": false,
  "isDuplicate": true,
  "message": "This lead already exists in this event. Previously scanned by stall \"BOOTH-A123\" at 12/24/2025, 2:55:33 PM. To create anyway, set allowDuplicate to true.",
  "duplicateInfo": {
    "stallName": "BOOTH-A123",
    "scannedAt": "12/24/2025, 2:55:33 PM",
    "existingLeadId": "694bb18dad852e282b899e29"
  }
}
```

**For Trial Events:**
```json
{
  "success": false,
  "isDuplicate": true,
  "message": "This lead already exists in this event. Previously scanned by stall \"Trial Event\" at 12/24/2025, 2:55:33 PM. To create anyway, set allowDuplicate to true.",
  "duplicateInfo": {
    "stallName": "Trial Event",
    "scannedAt": "12/24/2025, 2:55:33 PM",
    "existingLeadId": "694bb18dad852e282b899e29"
  }
}
```

---

## Frontend Implementation Example

### Handling Duplicate Detection

```javascript
try {
  const response = await axios.post('/leads', formData);
  // Lead created successfully
  console.log('Lead created:', response.data);
  
} catch (error) {
  if (error.response?.status === 409 && error.response?.data?.isDuplicate) {
    // Duplicate detected
    const { message, duplicateInfo } = error.response.data;
    
    // Show warning to user
    const confirmCreate = confirm(
      `${message}\n\nDo you want to create this lead anyway?`
    );
    
    if (confirmCreate) {
      // Retry with allowDuplicate flag
      formData.append('allowDuplicate', 'true');
      const retryResponse = await axios.post('/leads', formData);
      console.log('Duplicate lead created:', retryResponse.data);
    }
  } else {
    // Other error
    console.error('Error creating lead:', error);
  }
}
```

---

## Use Cases

### 1. Prevent Accidental Duplicates
- User scans the same business card twice at different booths
- System warns: "Already scanned by Booth A at 2:30 PM"
- User can choose to skip or create anyway

### 2. Multi-Booth Events
- Same person visits multiple booths
- Each booth can see who else scanned this lead
- Helps coordinate follow-ups

### 3. Trial Event Tracking
- Shows "Trial Event" instead of booth name
- Helps users understand their trial lead usage

---

## Important Notes

1. **Independent Leads**: Duplicate detection does NOT apply to independent leads (always allowed)

2. **Trial Events**: For trial events, stall name shows as "Trial Event" since there are no license keys

3. **Regular Events**: For regular events, stall name shows the license key used to join the event

4. **Matching Logic**: 
   - Matches on email OR phone number (not both required)
   - Case-insensitive email matching
   - Whitespace is trimmed

5. **Error Code**: Duplicate detection returns HTTP 409 (Conflict), not 400 or 500

---

## Testing

### Test Case 1: Create Duplicate (Should Fail)
```bash
# First lead
POST /leads
{
  "eventId": "event123",
  "details": {
    "email": "john@example.com",
    "phoneNumber": "+1234567890"
  }
}
# Response: 201 Created

# Second lead (duplicate)
POST /leads
{
  "eventId": "event123",
  "details": {
    "email": "john@example.com"  # Same email
  }
}
# Response: 409 Conflict with duplicate info
```

### Test Case 2: Force Create Duplicate
```bash
POST /leads
{
  "eventId": "event123",
  "allowDuplicate": true,
  "details": {
    "email": "john@example.com"
  }
}
# Response: 201 Created (duplicate allowed)
```

### Test Case 3: Different Events (Should Succeed)
```bash
POST /leads
{
  "eventId": "event456",  # Different event
  "details": {
    "email": "john@example.com"  # Same email, different event
  }
}
# Response: 201 Created (different event, no duplicate)
```
