# Authentication Service

## Overview
The authentication service provides a robust, secure, and flexible authentication system with multiple login methods, security features, and role-based access control. It supports various user roles including super_admin, company_admin, shop_manager, worker, and customer.

## Features

### Multiple Login Methods
1. **Traditional Login**
   - Email/Phone/Username + Password
   - Rate limited to 5 attempts
   - Account locking mechanism

2. **Two-Factor Authentication (2FA)**
   - Optional TOTP-based 2FA
   - QR code setup
   - Backup codes support

3. **OTP-based Login**
   - Email/Phone OTP verification
   - Rate limited to 3 attempts per identifier
   - Time-based expiration (15 minutes)

### Security Features
1. **Rate Limiting**
   - Login attempts: 5 per identifier/IP
   - Registration: 3 per IP
   - OTP requests: 3 per identifier

2. **Account Protection**
   - Automatic account locking after 5 failed attempts
   - 15-minute lockout period
   - Failed attempt tracking
   - Session management

3. **Password Security**
   - Secure password hashing
   - Password complexity requirements
   - Password reset functionality

### Session Management
1. **Token-based Authentication**
   - JWT access tokens
   - Secure HTTP-only refresh tokens
   - Session tracking and management

2. **Multi-device Support**
   - Multiple active sessions
   - Device tracking
   - Session revocation

## API Endpoints

### Registration
```http
POST /auth/register
Content-Type: application/json

# Role-specific registration bodies available in:
/bodies/Registrations/
```

### Login
```http
POST /auth/login
Content-Type: application/json

# Login bodies available in:
/bodies/Login/
```

### Two-Factor Authentication
```http
POST /auth/setup-2fa         # Setup 2FA
POST /auth/verify-2fa-setup  # Verify 2FA setup
POST /auth/disable-2fa       # Disable 2FA
```

### OTP Login
```http
POST /auth/request-otp-login # Request OTP
POST /auth/verify-otp-login  # Verify OTP
```

### Session Management
```http
POST /auth/logout            # Logout
POST /auth/refresh          # Refresh access token
GET /auth/sessions          # List active sessions
DELETE /auth/sessions/:id   # Revoke specific session
```

## Request/Response Examples

### Regular Login
Request:
```json
{
    "identifier": "user@example.com",
    "password": "SecurePass123!"
}
```
Response:
```json
{
    "ok": true,
    "accessToken": "eyJhbG...",
    "user": {
        "id": "...",
        "firstName": "...",
        // User details
    }
}
```

### Login with 2FA
Request:
```json
{
    "identifier": "user@example.com",
    "password": "SecurePass123!",
    "otp": "123456"
}
```

### OTP Login Flow
1. Request OTP:
```json
{
    "identifier": "user@example.com"
}
```

2. Verify OTP:
```json
{
    "identifier": "user@example.com",
    "code": "123456"
}
```

## Error Responses

### Invalid Credentials
```json
{
    "ok": false,
    "status": 401,
    "message": "Invalid credentials"
}
```

### Account Locked
```json
{
    "ok": false,
    "status": 423,
    "message": "Account locked"
}
```

### Rate Limit Exceeded
```json
{
    "ok": false,
    "status": 429,
    "message": "Rate limit exceeded"
}
```

## Security Best Practices

1. **Password Requirements**
   - Minimum 8 characters
   - Must contain uppercase and lowercase letters
   - Must contain numbers
   - Must contain special characters
   - Maximum 128 characters

2. **Rate Limiting**
   - Prevents brute force attacks
   - IP-based and identifier-based limits
   - Exponential backoff for repeated failures

3. **Session Security**
   - Short-lived access tokens (15 minutes)
   - Secure HTTP-only refresh tokens
   - Device fingerprinting
   - Active session tracking

4. **Data Protection**
   - Password hashing with secure algorithms
   - Sensitive data encryption
   - HTTP-only cookies for tokens
   - XSS and CSRF protection

## Event System
The service emits events for various actions:
- `user.registered`
- `user.logged_in`
- `user.logged_out`
- `user.2fa.enabled`
- `user.2fa.disabled`
- `user.verification.completed`
- `auth.session.refreshed`
- `auth.session.revoked`

## Caching
- User data: 5 minutes TTL
- Sessions: 1 minute TTL
- Verification codes: 15 minutes TTL
- Rate limit counters: 15 minutes TTL

## Dependencies
- Redis for caching and rate limiting
- RabbitMQ for event system
- MongoDB for data storage
- JWT for token management
- Speakeasy for 2FA

## Testing
Test bodies are available in the `/bodies` directory:
- `/bodies/Login/` - Login request bodies
- `/bodies/Registrations/` - Registration request bodies

## Error Handling
The service provides detailed error messages and appropriate HTTP status codes for all possible error scenarios:
- 400: Bad Request (validation errors)
- 401: Unauthorized (invalid credentials)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (duplicate entries)
- 423: Locked (account locked)
- 429: Too Many Requests (rate limit)