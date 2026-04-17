# CiviTrack Backend API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
Most endpoints require a JWT token in the `Authorization` header:
```
Authorization: Bearer <token>
```

## User Roles
- **applicant**: Can submit applications, view own applications
- **staff**: Can review applications, perform inspections, make decisions
- **admin**: Full access to all resources
- **committee**: Can view applications and provide decisions

---

## 1. Authentication Endpoints

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "full_name": "John Doe",
  "email": "john@example.com",
  "nic_number": "199512345V",
  "password": "SecurePass123!"
}

Response: 201 Created
{
  "id": "uuid",
  "email": "john@example.com",
  "verification_required": true,
  "message": "Verification code sent to email"
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}

Response: 200 OK
{
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "full_name": "John Doe",
    "role": "applicant"
  }
}
```

### Verify Email
```http
POST /auth/verify-email
Content-Type: application/json

{
  "email": "john@example.com",
  "code": "123456"
}

Response: 200 OK
{
  "message": "Email verified successfully"
}
```

---

## 2. Application Endpoints

### Create Application
```http
POST /applications
Authorization: Bearer <token>
Content-Type: application/json

{
  "application_type": "building",
  "submitted_applicant_name": "John Doe",
  "submitted_nic_number": "199512345V",
  "submitted_address": "123, Main Street, Kelaniya",
  "submitted_contact": "0712345678",
  "submitted_email": "john@example.com"
}

Response: 201 Created
{
  "message": "Application created successfully",
  "application": {
    "id": 101,
    "applicant_id": 12,
    "application_type": "building",
    "status": "submitted",
    "submission_date": "2026-03-29T10:00:00Z",
    "submitted_applicant_name": "John Doe"
  }
}
```

**Allowed application_type values:**
- building
- subdivision

Boundary wall requests are represented through `selected_permit_codes` with value `boundary_wall` on an application (typically under the building workflow), not as a separate `application_type` value.

### Get Applications (with filtering)
```http
GET /applications?status=submitted&type=building&page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "applications": [
    {
      "id": 101,
      "applicant_id": 12,
      "application_type": "building",
      "status": "submitted",
      "submission_date": "2026-03-29T10:00:00Z",
      "submitted_applicant_name": "John Doe",
      "submitted_email": "john@example.com",
      "document_count": 3,
      "inspection_count": 1
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

**Filter parameters:**
- `status`: Any valid application status
- `type`: building, subdivision
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Access control:**
- Applicants: See only their own applications
- Staff: See applications assigned to them + submitted applications
- Admin/Committee: See all applications

### Get Single Application
```http
GET /applications/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid",
  "applicant_id": 12,
  "application_type": "building",
  "status": "submitted",
  "submission_date": "2026-03-29T10:00:00Z",
  "applicant_full_name": "John Doe",
  "applicant_email": "john@example.com",
  "documents": [
    {
      "id": "uuid",
      "doc_type": "site_plan",
      "file_url": "/uploads/documents/file.pdf",
      "uploaded_at": "2026-03-29T10:05:00Z"
    }
  ],
  "inspections": [...],
  "status_history": [...]
}
```

### Update Application Details
```http
PATCH /applications/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "submitted_applicant_name": "Jane Doe",
  "submitted_email": "jane@example.com"
}

Response: 200 OK
{
  "message": "Application updated successfully",
  "application": { ... }
}
```

**Allowed fields for applicants to update:** submitted_applicant_name, submitted_email

### Update Application Status
```http
PATCH /applications/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "under_review",
  "notes": "Initial review started"
}

Response: 200 OK
{
  "message": "Application status updated successfully",
  "application": { ... }
}
```

**Allowed statuses:**
- draft, submitted, under_review, correction, committee_review
- not_granted_appeal_required, appeal_submitted
- approved_awaiting_agreement, agreement_completed
- permit_approved, permit_collected, closed
- pending, endorsed, approved, certified, rejected

**Note:** Only staff/admin/committee can update status

### Assign Application to Staff
```http
POST /applications/:id/assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "assigned_to": 5
}

Response: 200 OK
{
  "message": "Application assigned successfully"
}
```

**Note:** Only admin can assign applications

### Get Application Assignments
```http
GET /applications/:id/assignments
Authorization: Bearer <token>

Response: 200 OK
{
  "assignments": [
    {
      "id": 11,
      "application_id": 101,
      "assigned_to": 5,
      "staff_name": "Jane Smith",
      "assigned_by": 1,
      "assigned_by_name": "Admin User",
      "status": "pending",
      "assigned_at": "2026-03-29T10:00:00Z"
    }
  ]
}
```

### Delete Application
```http
DELETE /applications/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Application deleted successfully"
}
```

**Note:** Only pending applications can be deleted by their owner or by admin

### Get Application Statistics
```http
GET /applications/stats/summary
Authorization: Bearer <token>

Response: 200 OK
{
  "stats": [
    {
      "total_applications": 150,
      "pending": 25,
      "under_review": 40,
      "endorsed": 50,
      "certified": 20,
      "rejected": 10,
      "appealed": 5,
      "month": "2026-03-01T00:00:00Z"
    }
  ]
}
```

**Note:** Only staff/admin/committee can access statistics

---

## 3. Document Endpoints

### Upload Document
```http
POST /documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form data:
- file: (binary file)
- application_id: integer
- doc_type: string

Response: 201 Created
{
  "message": "Document uploaded successfully",
  "document": {
    "id": 41,
    "application_id": 101,
    "doc_type": "site_plan",
    "file_url": "uploads/documents/file.pdf",
    "uploaded_at": "2026-03-29T10:00:00Z"
  }
}
```

**Allowed file types:** PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX
**Maximum file size:** 10MB

### Get Application Documents
```http
GET /documents/application/:application_id
Authorization: Bearer <token>

Response: 200 OK
{
  "documents": [
    {
      "id": "uuid",
      "application_id": "uuid",
      "doc_type": "site_plan",
      "file_url": "/uploads/documents/file.pdf",
      "file_name": "site_plan.pdf",
      "file_size": 2048576,
      "uploaded_at": "2026-03-29T10:00:00Z",
      "uploaded_by": "uuid"
    }
  ]
}
```

### Download Document
```http
GET /documents/:id/download
Authorization: Bearer <token>

Response: 200 OK (file binary content)
```

### Delete Document
```http
DELETE /documents/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Document deleted successfully"
}
```

---

## 4. Health Check

### Database Connection Test
```http
GET /api/health
GET /api/db-test

Response: 200 OK
{
  "status": "Backend is running"
}
```

---

## 5. COC Request Endpoints

### Create COC Request
```http
POST /coc-requests
Authorization: Bearer <token>
Content-Type: application/json

{
  "application_id": 101,
  "notes": "Requesting COC after completion",
  "declarations": [
    "construction_complete",
    "ready_for_inspection"
  ]
}
```

### List COC Requests
```http
GET /coc-requests?status=requested&page=1&limit=20
Authorization: Bearer <token>
```

### Get COC Request
```http
GET /coc-requests/:id
Authorization: Bearer <token>
```

### Update COC Status
```http
PATCH /coc-requests/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "inspection-complete",
  "notes": "Inspection complete",
  "assigned_to": 7,
  "fee_amount": 2500
}
```

### Add Declaration
```http
POST /coc-requests/:id/declarations
Authorization: Bearer <token>
Content-Type: application/json

{
  "declaration_type": "construction_complete",
  "accepted": true
}
```

### Add Violation
```http
POST /coc-requests/:id/violations
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviation_type": "setback-violation",
  "fine_amount": 5000,
  "comments": "Front setback reduced",
  "inspection_type": "initial-inspection"
}
```

### Add Reinspection
```http
POST /coc-requests/:id/reinspections
Authorization: Bearer <token>
Content-Type: application/json

{
  "result": "compliant",
  "notes": "Rectification verified"
}
```

---

## 6. Permit Endpoints

### Issue Permit
```http
POST /permits/:applicationId/issue
Authorization: Bearer <token>
Content-Type: application/json

{
  "valid_until": "2027-03-29T00:00:00.000Z",
  "permit_reference": "PRM-2026-000101",
  "max_years": 5
}
```

### Get Permit by Application
```http
GET /permits/:applicationId
Authorization: Bearer <token>
```

### Extend Permit
```http
POST /permits/:applicationId/extend
Authorization: Bearer <token>
Content-Type: application/json

{
  "payment_status": "completed",
  "payment_reference": "PAY-EXT-0001",
  "payment_method": "card",
  "notes": "Year 2 extension"
}
```

### Record Permit Collection
```http
POST /permits/:applicationId/collect
Authorization: Bearer <token>
Content-Type: application/json

{
  "checks": [
    { "check_type": "applicant_identity_verified", "is_completed": true },
    { "check_type": "official_permit_signed_and_sealed", "is_completed": true }
  ]
}
```

### Get Expiring Permits Report
```http
GET /permits/reports/expiring?days=30
Authorization: Bearer <token>
```

---

## 7. Appeal Endpoints

### Create Appeal Case
```http
POST /appeals
Authorization: Bearer <token>
Content-Type: application/json

{
  "application_id": 101,
  "route": "committee",
  "summary": "Requesting reconsideration",
  "corrections_category": "documents",
  "contains_new_plans": false
}
```

### List Appeal Cases
```http
GET /appeals?status=submitted&page=1&limit=20
Authorization: Bearer <token>
```

### Get Appeal Case
```http
GET /appeals/:id
Authorization: Bearer <token>
```

### Add Appeal Version
```http
POST /appeals/:id/versions
Authorization: Bearer <token>
Content-Type: application/json

{
  "summary": "Updated submission after corrections",
  "corrections_category": "mixed",
  "contains_new_plans": true
}
```

### Add Appeal Member Note
```http
POST /appeals/:id/notes
Authorization: Bearer <token>
Content-Type: application/json

{
  "note": "Forward to technical officer for review"
}
```

### Update Appeal Status
```http
PATCH /appeals/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "forwarded-to-committee",
  "route": "committee",
  "portal_open": false
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "errors": [
    {
      "param": "email",
      "msg": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "No token provided"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Application not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create application",
  "details": "error message"
}
```

---

## Implementation Notes

### Role-Based Access Control
- **Applicants**: Can submit applications, upload documents, view own applications
- **Staff**: Can view assigned/submitted applications, perform inspections, upload documents
- **Admin**: Full access to create, read, update, delete all resources; manage user access
- **Committee**: Can view applications and provide decisions

### Database Constraints
- Application status is validated against CHECK constraint in database
- File uploads are limited to 10MB per file
- NIC numbers validated (old format: 9 digits + V/X, new format: 12 digits)
- Email addresses must be valid format

### Query Optimization
- Applications endpoint supports pagination (default 20, max 100 per page)
- Status change history automatically recorded in application_status_history table
- Documents include file metadata (size, upload time, uploader)

---

## Testing the API

### Example workflow:
1. Register: `POST /auth/register`
2. Verify email: `POST /auth/verify-email`
3. Login: `POST /auth/login` → Get token
4. Create application: `POST /applications` → Get application ID
5. Upload documents: `POST /documents/upload`
6. Check status: `GET /applications/:id`
7. (Admin) Assign application: `POST /applications/:id/assign`
8. (Staff) Update status: `PATCH /applications/:id/status`

---

## Implemented Backend Scope

Completed endpoint groups:
1. Authentication
2. Applications lifecycle
3. Documents
4. COC requests
5. Permits
6. Appeals
7. Notification email routes
