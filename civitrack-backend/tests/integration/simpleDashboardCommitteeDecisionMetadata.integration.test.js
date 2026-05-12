const request = require('supertest');

describe('simple dashboard committee approval metadata integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user || { userId: 31, role: 'committee', accountType: 'staff' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    jest.doMock('../../utils/emailService', () => ({
      sendApplicationToSWNotification: jest.fn(async () => ({ success: true })),
      sendApplicationToCommitteeNotification: jest.fn(async () => ({ success: true })),
      sendApplicationReferralNotificationToTO: jest.fn(async () => ({ success: true })),
      sendApplicantInspectionScheduledEmail: jest.fn(async () => ({ success: true })),
      sendApplicantApprovalEmail: jest.fn(async () => ({ success: true })),
      sendApplicantCorrectionsEmail: jest.fn(async () => ({ success: true })),
    }));

    const pool = {
      query: jest.fn(poolQueryImpl),
      connect: jest.fn(async () => ({
        query: jest.fn(poolQueryImpl),
        release: jest.fn(),
      })),
    };

    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app };
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../utils/emailService');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('rejects committee approval without complete decision metadata', async () => {
    const { app } = loadAppWithMocks({
      poolQueryImpl: async (sql) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM applications') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 88, status: 'endorsed', applicant_id: 9, application_code: 'APP-88' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) return { rows: [] };
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/simple/applications/88/advance')
      .send({ status: 'approved', notes: 'Approved by committee.' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'COMMITTEE_DECISION_METADATA_REQUIRED',
      })
    );
  });

  test('maps committee approved decision to approved_awaiting_agreement', async () => {
    const { app } = loadAppWithMocks({
      poolQueryImpl: async (sql) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT') return { rows: [] };
        if (sql.includes('FROM applications') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 89, status: 'endorsed', applicant_id: 9, application_code: 'APP-89' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) return { rows: [] };
        if (sql.includes('UPDATE applications') || sql.includes('INSERT INTO application_status_history')) return { rows: [] };
        if (sql.includes('FROM applicants')) {
          return { rows: [{ full_name: 'Applicant Three', email: 'app3@example.com' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/simple/applications/89/advance')
      .send({
        status: 'approved',
        notes: 'Approved subject to agreement signing.',
        decisionMeta: {
          decisionNo: 'CD-2026-015',
          meetingDate: '2026-04-27',
          decisionReason: 'Committee accepted SW recommendation and required agreement.',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        from: 'endorsed',
        requestedTo: 'approved',
        to: 'approved_awaiting_agreement',
      })
    );
  });
});

