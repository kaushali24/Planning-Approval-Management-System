export const cocRequests = [
  {
    id: 'COC-2025-003',
    applicationId: 'APP/2025/00012',
    type: 'Building Permit',
    requestDate: '2025-11-20',
    status: 'approved',
    issuedDate: '2025-11-22',
    validUntil: '2027-11-22'
  },
  {
    id: 'COC-2025-002',
    applicationId: 'APP/2025/00011',
    type: 'Boundary Wall',
    requestDate: '2025-08-15',
    status: 'approved',
    issuedDate: '2025-08-18',
    validUntil: '2027-08-18'
  },
  {
    id: 'COC-2025-004',
    applicationId: 'APP/2025/00020',
    type: 'Land Subdivision',
    requestDate: '2025-12-02',
    status: 'inspection',
    issuedDate: null,
    validUntil: null
  },
  {
    id: 'COC-2025-005',
    applicationId: 'APP/2025/00021',
    type: 'Dwelling Unit',
    requestDate: '2025-12-18',
    status: 'pending',
    issuedDate: null,
    validUntil: null
  }
];

export const approvedApplications = [
  { id: 'APP/2025/00012', type: 'Building Permit', approved: '2025-08-20' },
  { id: 'APP/2025/00010', type: 'Land Subdivision', approved: '2025-09-05' },
  { id: 'APP/2025/00020', type: 'Land Subdivision', approved: '2025-10-12' }
];

export const getCocSummary = (list = cocRequests) => {
  const summary = { pending: 0, inInspection: 0, issued: 0 };

  list.forEach((item) => {
    if (item.status === 'approved') summary.issued += 1;
    else if (item.status === 'inspection') summary.inInspection += 1;
    else summary.pending += 1;
  });

  return summary;
};
