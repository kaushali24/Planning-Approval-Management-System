const request = require('supertest');

describe('notifications integration', () => {
  const loadAppWithMocks = (emailServiceOverrides = {}) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = { userId: 1, role: 'admin' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const defaultEmailService = {
      sendApplicationToSWNotification: jest.fn(async () => ({ success: true, messageId: 'msg-sw-1' })),
      sendApplicationToCommitteeNotification: jest.fn(async () => ({ success: true, messageId: 'msg-committee-1' })),
      sendApplicationReferralNotificationToTO: jest.fn(async () => ({ success: true, messageId: 'msg-referral-1' })),
      sendApplicantApprovalEmail: jest.fn(async () => ({ success: true, messageId: 'msg-approved-1' })),
      sendApplicantPermitCollectedEmail: jest.fn(async () => ({ success: true, messageId: 'msg-collected-1' })),
      sendPermitExpiringSoonEmail: jest.fn(async () => ({ success: true, messageId: 'msg-expiring-1' })),
      sendPermitExpiredEmail: jest.fn(async () => ({ success: true, messageId: 'msg-expired-1' })),
      sendPermitExtendedEmail: jest.fn(async () => ({ success: true, messageId: 'msg-extended-1' })),
      sendApplicantCorrectionsEmail: jest.fn(async () => ({ success: true, messageId: 'msg-corrections-1' })),
    };

    jest.doMock('../../utils/emailService', () => ({
      ...defaultEmailService,
      ...emailServiceOverrides,
    }));

    return require('../../server');
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../utils/emailService');
    jest.resetModules();
  });

  test('POST /api/notifications/send-to-sw validates required fields', async () => {
    const app = loadAppWithMocks();

    const response = await request(app)
      .post('/api/notifications/send-to-sw')
      .send({ swName: 'Superintendent One' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          path: '/api/notifications/send-to-sw',
          method: 'POST',
        }),
      })
    );
    expect(Array.isArray(response.body.error.errors)).toBe(true);
    expect(response.body.error.errors.length).toBeGreaterThan(0);
  });

  test('POST /api/notifications/send-to-sw returns success payload when email send succeeds', async () => {
    const app = loadAppWithMocks();

    const response = await request(app)
      .post('/api/notifications/send-to-sw')
      .send({
        email: 'sw@example.com',
        swName: 'Superintendent One',
        applicantName: 'Applicant One',
        applicationId: 'APP-1001',
        toOfficerName: 'TO One',
        recommendation: 'approve',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Notification sent to SW successfully',
      messageId: 'msg-sw-1',
    });
  });

  test('POST /api/notifications/send-to-sw returns standardized 500 when email service returns failure', async () => {
    const app = loadAppWithMocks({
      sendApplicationToSWNotification: jest.fn(async () => ({
        success: false,
        error: 'SMTP unavailable',
      })),
    });

    const response = await request(app)
      .post('/api/notifications/send-to-sw')
      .send({
        email: 'sw@example.com',
        swName: 'Superintendent One',
        applicantName: 'Applicant One',
        applicationId: 'APP-1002',
        toOfficerName: 'TO One',
        recommendation: 'approve',
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'NOTIFICATION_SEND_FAILED',
          message: 'Failed to send notification',
        }),
      })
    );
  });
});
