const request = require('supertest');

describe('application payment routes integration', () => {
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

  test('POST /api/applications/:id/payment-proof validates request payload', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .post('/api/applications/12/payment-proof')
      .send({
        amount: 5000,
        payment_method: 'wire',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        }),
      })
    );
  });

  test('POST /api/applications/:id/payment-proof creates processing payment entry', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return { rows: [] };
        }

        if (sql.includes('FROM applications')) {
          return { rows: [{ id: 12, applicant_id: 21 }] };
        }

        if (sql.includes('FROM payments')) {
          return {
            rows: [{
              id: 90,
              amount: '5000.00',
              status: 'pending',
            }],
          };
        }

        if (sql.includes('UPDATE payments')) {
          return {
            rows: [{
              id: 90,
              application_id: 12,
              payment_type: 'application_fee',
              amount: '5000.00',
              status: 'processing',
              payment_method: 'bank',
              transaction_id: 'OFFLINE-REF-001',
            }],
          };
        }

        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/payment-proof')
      .send({
        amount: 5000,
        payment_method: 'bank',
        reference_no: 'OFFLINE-REF-001',
        submitted_at: '2026-04-17T07:00:00.000Z',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Payment proof submitted successfully',
        payment: expect.objectContaining({
          application_id: 12,
          status: 'processing',
          payment_method: 'bank',
          transaction_id: 'OFFLINE-REF-001',
        }),
      })
    );
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  test('POST /api/applications/:id/payments/online creates completed online payment entry', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return { rows: [] };
        }

        if (sql.includes('FROM applications')) {
          return { rows: [{ id: 12, applicant_id: 21 }] };
        }

        if (sql.includes('FROM payments')) {
          return {
            rows: [{
              id: 91,
              amount: '5000.00',
              status: 'pending',
            }],
          };
        }

        if (sql.includes('UPDATE payments')) {
          return {
            rows: [{
              id: 91,
              application_id: 12,
              payment_type: 'application_fee',
              amount: '5000.00',
              status: 'completed',
              payment_method: 'online',
              transaction_id: 'TXN-ONLINE-001',
            }],
          };
        }

        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/payments/online')
      .send({
        amount: 5000,
        transaction_id: 'TXN-ONLINE-001',
        receipt_id: 'RCPT-ONLINE-001',
        paid_at: '2026-04-17T07:01:00.000Z',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Online payment recorded successfully',
        payment: expect.objectContaining({
          application_id: 12,
          status: 'completed',
          payment_method: 'online',
          transaction_id: 'TXN-ONLINE-001',
        }),
      })
    );
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  test('POST /api/applications/:id/payment-proof rejects when fee request is not pending', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM applications')) {
          return { rows: [{ id: 12, applicant_id: 21, status: 'payment_pending' }] };
        }
        if (sql.includes('FROM payments')) {
          return { rows: [{ id: 501, amount: '5000.00', status: 'submitted' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/payment-proof')
      .send({
        amount: 5000,
        payment_method: 'bank',
        reference_no: 'OFFLINE-REF-002',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({
      error: 'Inspection fee request is missing or already submitted',
      code: 'PAYMENT_REQUEST_NOT_PENDING',
    }));
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('POST /api/applications/:id/payment-proof rejects mismatched amount', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 21, role: 'applicant', accountType: 'applicant' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM applications')) {
          return { rows: [{ id: 12, applicant_id: 21, status: 'payment_pending' }] };
        }
        if (sql.includes('FROM payments')) {
          return { rows: [{ id: 502, amount: '7500.00', status: 'pending' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/payment-proof')
      .send({
        amount: 5000,
        payment_method: 'counter',
        reference_no: 'OFFLINE-REF-003',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    expect(String(response.body.error || '')).toContain('does not match requested fee');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('POST /api/applications/:id/verify-payment rejects when application is not payment_pending', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 9, role: 'planning_officer', accountType: 'staff' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, status FROM applications')) {
          return { rows: [{ id: 12, status: 'under_review' }] };
        }
        if (sql.includes("FROM payments") && sql.includes("status IN ('pending', 'processing', 'submitted')")) {
          return { rows: [{ id: 800, status: 'submitted', amount: '5000.00', transaction_id: 'TX-1', payment_method: 'online' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/verify-payment')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({
      code: 'INVALID_STATUS_FOR_PAYMENT_VERIFY',
      currentStatus: 'under_review',
    }));
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('POST /api/applications/:id/verify-payment rejects missing transaction reference', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 9, role: 'planning_officer', accountType: 'staff' },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, status FROM applications')) {
          return { rows: [{ id: 12, status: 'payment_pending' }] };
        }
        if (sql.includes("FROM payments") && sql.includes("status IN ('pending', 'processing', 'submitted')")) {
          return { rows: [{ id: 801, status: 'pending', amount: '5000.00', transaction_id: null, payment_method: 'bank' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/12/verify-payment')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({
      error: 'Payment reference is required before verification',
      code: 'PAYMENT_REFERENCE_REQUIRED',
    }));
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});