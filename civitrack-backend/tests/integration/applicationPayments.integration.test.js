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

        if (sql.includes('INSERT INTO payments')) {
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

        if (sql.includes('INSERT INTO payments')) {
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
});