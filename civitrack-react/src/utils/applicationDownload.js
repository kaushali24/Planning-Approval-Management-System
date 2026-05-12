/**
 * Generate and download application as PDF or formatted document
 */

export const downloadApplicationAsPDF = (applicationData) => {
  const {
    applicationId,
    applicationType,
    applicantName,
    nicNumber,
    applicantAddress,
    contactNumber,
    email,
    assessmentNumber,
    deedNumber,
    surveyPlan,
    landExtent,
    latitude,
    longitude,
    applicationFeeMethod,
    applicationFeeTransactionId,
    submittedAt
  } = applicationData;

  // Create formatted text content
  const content = formatApplicationContent(applicationData);
  
  // Create blob and download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Application-${applicationId}-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadApplicationAsHTML = (applicationData) => {
  const content = generateHTMLContent(applicationData);
  
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Application-${applicationData.applicationId}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const formatApplicationContent = (data) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPermitTypeLabel = (type) => {
    const labels = {
      building: 'Building Permit (Including Boundary Wall Section)',
      subdivision: 'Land Subdivision Permit'
    };
    return labels[type] || 'Unknown';
  };

  return `
═══════════════════════════════════════════════════════════════
KELANIYA PRADESHIYA SABHA - PERMIT APPLICATION
═══════════════════════════════════════════════════════════════

APPLICATION ID: ${data.applicationId}
SUBMISSION DATE: ${formatDate(data.submittedAt)}

───────────────────────────────────────────────────────────────
APPLICANT INFORMATION
───────────────────────────────────────────────────────────────
Full Name: ${data.applicantName || 'N/A'}
NIC Number: ${data.nicNumber || 'N/A'}
Address: ${data.applicantAddress || 'N/A'}
Contact Number: ${data.contactNumber || 'N/A'}
Email: ${data.email || 'N/A'}

───────────────────────────────────────────────────────────────
PROPERTY INFORMATION
───────────────────────────────────────────────────────────────
Assessment Number: ${data.assessmentNumber || 'N/A'}
Deed Number: ${data.deedNumber || 'N/A'}
Survey Plan: ${data.surveyPlan || 'N/A'}
Land Extent: ${data.landExtent || 'N/A'}

───────────────────────────────────────────────────────────────
LOCATION DETAILS
───────────────────────────────────────────────────────────────
Latitude: ${data.latitude ? Number(data.latitude).toFixed(4) : 'N/A'}
Longitude: ${data.longitude ? Number(data.longitude).toFixed(4) : 'N/A'}

───────────────────────────────────────────────────────────────
APPLICATION DETAILS
───────────────────────────────────────────────────────────────
Permit Type: ${getPermitTypeLabel(data.applicationType)}
${data.applicationType === 'building' ? `
Building Nature: ${data.buildingNature || 'N/A'}
Building Use: ${data.buildingUse || 'N/A'}
Existing Buildings: ${data.existingBuildings || 'N/A'}
Road Width: ${data.roadWidth || 'N/A'}
Number of Floors: ${data.numberOfFloors || 'N/A'}
Total Floor Area: ${data.totalFloorArea || 'N/A'}
Front Setback: ${data.frontSetback || 'N/A'}
Rear Setback: ${data.rearSetback || 'N/A'}
Side Setback 1: ${data.sideSetback1 || 'N/A'}
Side Setback 2: ${data.sideSetback2 || 'N/A'}
Water Source: ${data.waterSource || 'N/A'}
Wastewater Method: ${data.wastewaterMethod || 'N/A'}
Construction Cost: ${data.constructionCost || 'N/A'}

${data.requiresBoundaryWallPermission ? `
BOUNDARY WALL DETAILS
Wall Length: ${data.wallLength || 'N/A'}
Wall Height: ${data.wallHeight || 'N/A'}
Wall Materials: ${data.wallMaterials || 'N/A'}
` : ''}` : ''}
${data.applicationType === 'subdivision' ? `
Subdivision Nature: ${data.subdivisionNature || 'N/A'}
Subdivision Use: ${data.subdivisionUse || 'N/A'}
Number of Lots: ${data.numberOfLots || 'N/A'}
Smallest Lot Extent: ${data.smallestLotExtent || 'N/A'}
` : ''}

───────────────────────────────────────────────────────────────
PAYMENT INFORMATION
───────────────────────────────────────────────────────────────
Payment Method: ${data.applicationFeeMethod || 'N/A'}
Payment Status: Confirmed
${data.applicationFeeTransactionId ? `Transaction ID: ${data.applicationFeeTransactionId}` : 'Bank Slip Reference: ' + (data.applicationFeeReceiptRef || 'N/A')}
Payment Date: ${formatDate(data.applicationFeePaidAt)}

───────────────────────────────────────────────────────────────
DOCUMENTS SUBMITTED
───────────────────────────────────────────────────────────────
${Object.entries(data.documents || {}).length > 0 
  ? Object.entries(data.documents).map(([key, files]) => 
      `• ${key}: ${files && files.length > 0 ? files.map(f => f.name).join(', ') : 'No file'}`
    ).join('\n')
  : 'No documents uploaded'}

═══════════════════════════════════════════════════════════════
IMPORTANT NOTES
═══════════════════════════════════════════════════════════════
• Please keep this document for your records
• Your application ID is: ${data.applicationId}
• A planning officer will be assigned to review your application
• You will receive email updates about your application status
• For inquiries, contact Kelaniya Pradeshiya Sabha
• Submitted on: ${formatDate(data.submittedAt)}

═══════════════════════════════════════════════════════════════
Document generated on ${formatDate(new Date().toISOString())}
═══════════════════════════════════════════════════════════════
`;
};

const generateHTMLContent = (data) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPermitTypeLabel = (type) => {
    const labels = {
      building: 'Building Permit (Including Boundary Wall Section)',
      subdivision: 'Land Subdivision Permit'
    };
    return labels[type] || 'Unknown';
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application ${data.applicationId}</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border: 1px solid #ddd;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #1e40af;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 24px;
      color: #1e40af;
      margin-bottom: 10px;
    }
    .application-id {
      font-size: 18px;
      font-weight: bold;
      color: #1e40af;
      margin-top: 10px;
    }
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .section-title {
      background-color: #f0f9ff;
      border-left: 4px solid #1e40af;
      padding: 10px 15px;
      margin-bottom: 15px;
      font-weight: bold;
      font-size: 14px;
      color: #1e40af;
    }
    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 12px;
    }
    .field-row.full {
      grid-template-columns: 1fr;
    }
    .field {
      margin-bottom: 8px;
    }
    .field-label {
      font-weight: bold;
      color: #1e40af;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .field-value {
      color: #555;
      font-size: 14px;
      padding: 8px;
      background-color: #f9fafb;
      border-radius: 4px;
    }
    .important-note {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin-top: 30px;
      border-radius: 4px;
    }
    .important-note h3 {
      color: #b45309;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .important-note ul {
      margin-left: 20px;
      font-size: 13px;
      color: #92400e;
    }
    .important-note li {
      margin-bottom: 6px;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #ddd;
      padding-top: 20px;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    @media print {
      body { padding: 0; }
      .container { border: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Kelaniya Pradeshiya Sabha</h1>
      <p style="color: #666; margin-top: 5px; font-size: 14px;">Permit Application Submission</p>
      <div class="application-id">Application ID: ${data.applicationId}</div>
      <p style="color: #888; font-size: 12px; margin-top: 8px;">Submitted: ${formatDate(data.submittedAt)}</p>
    </div>

    <!-- Applicant Information Section -->
    <div class="section">
      <div class="section-title">Applicant Information</div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Full Name</div>
          <div class="field-value">${data.applicantName || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">NIC Number</div>
          <div class="field-value">${data.nicNumber || 'N/A'}</div>
        </div>
      </div>
      <div class="field-row full">
        <div class="field">
          <div class="field-label">Address</div>
          <div class="field-value">${data.applicantAddress || 'N/A'}</div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Contact Number</div>
          <div class="field-value">${data.contactNumber || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Email</div>
          <div class="field-value">${data.email || 'N/A'}</div>
        </div>
      </div>
    </div>

    <!-- Property Information Section -->
    <div class="section">
      <div class="section-title">Property Information</div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Assessment Number</div>
          <div class="field-value">${data.assessmentNumber || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Deed Number</div>
          <div class="field-value">${data.deedNumber || 'N/A'}</div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Survey Plan</div>
          <div class="field-value">${data.surveyPlan || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Land Extent</div>
          <div class="field-value">${data.landExtent || 'N/A'}</div>
        </div>
      </div>
    </div>

    <!-- Location Section -->
    ${(data.latitude || data.longitude) ? `
    <div class="section">
      <div class="section-title">Location Coordinates</div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Latitude</div>
          <div class="field-value">${data.latitude ? Number(data.latitude).toFixed(4) : 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Longitude</div>
          <div class="field-value">${data.longitude ? Number(data.longitude).toFixed(4) : 'N/A'}</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Application Details Section -->
    <div class="section">
      <div class="section-title">Application Details</div>
      <div class="field-row full">
        <div class="field">
          <div class="field-label">Permit Type</div>
          <div class="field-value">${getPermitTypeLabel(data.applicationType)}</div>
        </div>
      </div>
      ${data.applicationType === 'building' ? `
      <div class="field-row">
        <div class="field">
          <div class="field-label">Building Nature</div>
          <div class="field-value">${data.buildingNature || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Building Use</div>
          <div class="field-value">${data.buildingUse || 'N/A'}</div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Number of Floors</div>
          <div class="field-value">${data.numberOfFloors || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Total Floor Area</div>
          <div class="field-value">${data.totalFloorArea || 'N/A'}</div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Front Setback</div>
          <div class="field-value">${data.frontSetback || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Rear Setback</div>
          <div class="field-value">${data.rearSetback || 'N/A'}</div>
        </div>
      </div>
      ` : ''}
      ${data.applicationType === 'subdivision' ? `
      <div class="field-row">
        <div class="field">
          <div class="field-label">subdivision Nature</div>
          <div class="field-value">${data.subdivisionNature || 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Number of Lots</div>
          <div class="field-value">${data.numberOfLots || 'N/A'}</div>
        </div>
      </div>
      ` : ''}
    </div>

    <!-- Payment Information Section -->
    <div class="section">
      <div class="section-title">Payment Information</div>
      <div class="field-row">
        <div class="field">
          <div class="field-label">Payment Method</div>
          <div class="field-value">${data.applicationFeeMethod ? data.applicationFeeMethod.toUpperCase() : 'N/A'}</div>
        </div>
        <div class="field">
          <div class="field-label">Payment Status</div>
          <div class="field-value" style="color: #059669; background-color: #d1fae5;">✓ Confirmed</div>
        </div>
      </div>
      ${data.applicationFeeTransactionId ? `
      <div class="field-row full">
        <div class="field">
          <div class="field-label">Transaction ID</div>
          <div class="field-value">${data.applicationFeeTransactionId}</div>
        </div>
      </div>
      ` : ''}
      <div class="field-row full">
        <div class="field">
          <div class="field-label">Payment Date</div>
          <div class="field-value">${formatDate(data.applicationFeePaidAt)}</div>
        </div>
      </div>
    </div>

    <!-- Important Notes -->
    <div class="important-note">
      <h3>Important Notes</h3>
      <ul>
        <li>Please keep this document for your records</li>
        <li>Your application ID is: <strong>${data.applicationId}</strong></li>
        <li>A planning officer will be assigned to review your application within 5-7 working days</li>
        <li>You will receive email updates about your application status at: <strong>${data.email}</strong></li>
        <li>For inquiries, contact Kelaniya Pradeshiya Sabha - Planning Section</li>
      </ul>
    </div>

    <div class="footer">
      <p>This document was generated on ${formatDate(new Date().toISOString())}</p>
      <p>Do not modify this document. For support, contact support@kps.lk</p>
    </div>
  </div>
</body>
</html>
`;
};
