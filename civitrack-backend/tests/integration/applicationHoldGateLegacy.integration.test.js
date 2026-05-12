const request = require('supertest');

describe('legacy application hold gate integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl, poolConnectQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user;
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const queryImpl = poolQueryImpl || (async () => ({ rows: [] }));
    const connectQueryImpl = poolConnectQueryImpl || queryImpl;

    const mockClient = {
      query: jest.fn(connectQueryImpl),
      release: jest.fn(),
    };

    const pool = {
      query: jest.fn(queryImpl),
      connect: jest.fn(async () => mockClient),
    };

    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app, pool, mockClient };
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('POST /api/applications/:id/set-fee returns 409 when active hold exists', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 12, role: 'planning_officer', accountType: 'staff' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM applications WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ status: 'under_review', applicant_id: 55 }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 1, hold_type: 'complaint' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/set-fee')
      .send({ amount: 5000 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'APPLICATION_ON_HOLD',
        currentStatus: 'under_review',
        requestedStatus: 'payment_pending',
      })
    );
  });

  test('POST /api/applications/:id/verify-payment returns 409 when active hold exists', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 12, role: 'planning_officer', accountType: 'staff' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, status FROM applications WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 12, status: 'payment_pending' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 2, hold_type: 'clearance' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app).post('/api/applications/12/verify-payment').send({});

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'APPLICATION_ON_HOLD',
        currentStatus: 'payment_pending',
        requestedStatus: 'under_review',
      })
    );
  });

  test('PATCH /api/applications/:id/resubmit returns 409 when active hold exists', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT status FROM applications WHERE id = $1 AND applicant_id = $2 FOR UPDATE')) {
          return { rows: [{ status: 'correction' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 3, hold_type: 'complaint' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .patch('/api/applications/99/resubmit')
      .send({
        application_type: 'building',
        submitted_applicant_name: 'Test Applicant',
        submitted_nic_number: '200012345678',
        submitted_email: 'test@example.com',
        submitted_address: 'Test Address',
        submitted_contact: '0712345678',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'APPLICATION_ON_HOLD',
        currentStatus: 'correction',
        requestedStatus: 'submitted',
      })
    );
  });

  test('PATCH /api/applications/:id/resubmit returns 400 when fee is not recorded', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT status FROM applications WHERE id = $1 AND applicant_id = $2 FOR UPDATE')) {
          return { rows: [{ status: 'correction' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [] };
        }
        if (sql.includes('FROM payments') && sql.includes("payment_type = 'application_fee'")) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .patch('/api/applications/99/resubmit')
      .send({
        application_type: 'building',
        submitted_applicant_name: 'Test Applicant',
        submitted_nic_number: '200012345678',
        submitted_email: 'test@example.com',
        submitted_address: 'Test Address',
        submitted_contact: '0712345678',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'FEE_REQUIRED_BEFORE_SUBMISSION',
      })
    );
  });

  test('POST /api/applications/:id/preliminary-check finalization returns 409 when active hold exists', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 12, role: 'planning_officer', accountType: 'staff' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, status FROM applications WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 77, status: 'under_review' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 4, hold_type: 'complaint' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/77/preliminary-check')
      .send({
        deficientDocuments: [],
        notes: 'All good',
        isDraft: false,
        checklist: { surveyScale: true },
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'APPLICATION_ON_HOLD',
        currentStatus: 'under_review',
        requestedStatus: 'verified',
      })
    );
  });

  test('POST /api/applications/:id/preliminary-check allows admin finalization with active hold', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 99, role: 'admin', accountType: 'staff' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT id, status FROM applications WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 88, status: 'under_review' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 5, hold_type: 'complaint' }] };
        }
        if (sql.includes('UPDATE applications')) return { rows: [] };
        if (sql.includes('INSERT INTO application_status_history')) return { rows: [] };
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/88/preliminary-check')
      .send({
        deficientDocuments: [],
        notes: 'Admin override finalization',
        isDraft: false,
        checklist: { surveyScale: true },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'verified',
      })
    );
  });
});

