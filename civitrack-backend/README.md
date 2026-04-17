# CiviTrack Backend

Official Planning Approval System Backend - Node.js + Express + PostgreSQL

## Setup Instructions

### 1. Prerequisites
- Node.js (v14+)
- PostgreSQL (v12+)
- npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup

**Create PostgreSQL database:**
```sql
CREATE DATABASE civitrack_db;
```

**Run schema:**
```bash
psql -U postgres -d civitrack_db -f database/schema.sql
```

**Seed sample data for testing:**
```bash
npm run seed:sample
```

**Backfill/fix demo workflow integrity gaps:**
```bash
npm run seed:demo:fix
```

This creates two applicant logins and sample workflow rows. The seeded applicant emails are `kaushalinanayakkara2001@gmail.com` and `pabodakaushali2001@gmail.com`.

### 4. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
DATABASE_URL=postgresql://username:password@localhost:5432/civitrack_db
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
PORT=5000
NODE_ENV=development
```

### 5. Start Server

**Development mode (with nodemon):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Server will run on `http://localhost:5000`

### 6. Test Connection

Visit: `http://localhost:5000/api/health`

Expected response:
```json
{ "status": "Backend is running" }
```

## API Endpoints

### Authentication

**POST** `/api/auth/register` - Applicant registration
```json
{
  "fullName": "Nimal Perera",
  "nicNumber": "198012345678",
  "email": "kaushalinanayakkara2001@gmail.com",
  "contactNumber": "071234567",
  "password": "password123"
}
```

**POST** `/api/auth/login` - Login (applicant & staff)
```json
{
  "email": "kaushalinanayakkara2001@gmail.com",
  "password": "password123"
}
```

**GET** `/api/auth/me` - Get current user (requires token)
- Header: `Authorization: Bearer <token>`

**POST** `/api/auth/forgot-password` - Request password reset
```json
{
  "email": "kaushalinanayakkara2001@gmail.com"
}
```

**POST** `/api/auth/verify-token` - Verify reset token
```json
{
  "email": "kaushalinanayakkara2001@gmail.com",
  "token": "123456"
}
```


**POST** `/api/auth/reset-password` - Reset password
```json
{
  "email": "kaushalinanayakkara2001@gmail.com",
  "token": "123456",
  "newPassword": "newpassword123"
}
```

## Project Structure

```
civitrack-backend/
├── config/
│   └── db.js              # Database connection
├── controllers/
│   └── authController.js  # Authentication logic
├── middleware/
│   └── auth.js           # JWT middleware
├── routes/
│   └── auth.js           # Auth routes
├── utils/
│   └── jwt.js            # JWT utilities
├── database/
│   └── schema.sql        # Database schema
├── server.js             # Main server file
├── .env.example          # Environment template
├── .env                  # Environment variables (create from example)
└── package.json          # Dependencies
```

## Testing with Postman

1. Import endpoints into Postman
2. Test registration - get token
3. Use token for protected routes
4. Test forgot password flow

## Verification Commands

Run unit + integration tests:
```bash
npm test
```

Run DB-backed smoke workflow tests and strict workflow audit:
```bash
npm run test:backend
```

Run workflow audit only:
```bash
npm run audit:workflow
```

## Notes

- Passwords are hashed using bcryptjs
- JWT tokens expire after 7 days
- Password reset tokens expire after 15 minutes
- Email sending not implemented yet (logs to console)
