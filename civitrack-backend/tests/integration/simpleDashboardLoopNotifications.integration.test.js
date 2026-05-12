const request = require('supertest');

describe('simple dashboard loop-edge notifications integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl, emailServiceOverrides = {} }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user || { userId: 21, role: 'superintendent', accountType: 'staff' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const defaultEmailService = {
      sendApplicationToSWNotification: jest.fn(async () => ({ success: true, messageId: 'msg-sw' })),
      sendApplicationToCommitteeNotification: jest.fn(async () => ({ success: true, messageId: 'msg-committee' })),
      sendApplicationReferralNotificationToTO: jest.fn(async () => ({ success: true, messageId: 'msg-referral' })),
      sendApplicantInspectionScheduledEmail: jest.fn(async () => ({ success: true, messageId: 'msg-inspection' })),
      sendApplicantApprovalEmail: jest.fn(async () => ({ success: true, messageId: 'msg-approved' })),
      sendApplicantCorrectionsEmail: jest.fn(async () => ({ success: true, messageId: 'msg-corrections' })),
    };

    const emailService = {
      ...defaultEmailService,
      ...emailServiceOverrides,
    };

    jest.doMock('../../utils/emailService', () => emailService);

    const pool = {
      query: jest.fn(poolQueryImpl),
      connect: jest.fn(async () => ({
        query: jest.fn(poolQueryImpl),
        release: jest.fn(),
      })),
    };
    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app, emailService };
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../utils/emailService');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('sends committee notification when SW endorses application', async () => {
    const { app, emailService } = loadAppWithMocks({
      user: { userId: 21, role: 'superintendent', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT') return { rows: [] };
        if (sql.includes('FROM applications') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 77, status: 'sw_review_pending', applicant_id: 5, application_code: 'APP-77' }],
          };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) return { rows: [] };
        if (sql.includes('UPDATE applications') || sql.includes('INSERT INTO application_status_history')) return { rows: [] };
        if (sql.includes('FROM applicants')) {
          return { rows: [{ full_name: 'Applicant One', email: 'applicant@example.com' }] };
        }
        if (sql.includes("FROM staff_accounts") && sql.includes("role = 'committee'")) {
          return { rows: [{ full_name: 'Committee One', email: 'committee@example.com' }] };
        }
        if (sql.includes('FROM staff_accounts') && sql.includes('WHERE id = $1')) {
          return { rows: [{ full_name: 'SW One' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/simple/applications/77/advance')
      .send({ status: 'endorsed', notes: 'Reviewed and endorsed.' });

    expect(response.status).toBe(200);
    expect(emailService.sendApplicationToCommitteeNotification).toHaveBeenCalledTimes(1);
    expect(emailService.sendApplicationReferralNotificationToTO).not.toHaveBeenCalled();
  });

  test('sends TO referral notification when SW sends app back to under_review', async () => {
    const { app, emailService } = loadAppWithMocks({
      user: { userId: 21, role: 'superintendent', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT') return { rows: [] };
        if (sql.includes('FROM applications') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 78, status: 'sw_review_pending', applicant_id: 5, application_code: 'APP-78' }],
          };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) return { rows: [] };
        if (sql.includes('UPDATE applications') || sql.includes('INSERT INTO application_status_history')) return { rows: [] };
        if (sql.includes('FROM applicants')) {
          return { rows: [{ full_name: 'Applicant Two', email: 'applicant2@example.com' }] };
        }
        if (sql.includes('FROM application_assignments aa') && sql.includes('JOIN staff_accounts s')) {
          return { rows: [{ full_name: 'TO One', email: 'to@example.com' }] };
        }
        if (sql.includes('FROM staff_accounts') && sql.includes('WHERE id = $1')) {
          return { rows: [{ full_name: 'SW One' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/simple/applications/78/advance')
      .send({ status: 'under_review', notes: 'Please revise report details.' });

    expect(response.status).toBe(200);
    expect(emailService.sendApplicationReferralNotificationToTO).toHaveBeenCalledTimes(1);
    expect(emailService.sendApplicationToCommitteeNotification).not.toHaveBeenCalled();
  });
});

