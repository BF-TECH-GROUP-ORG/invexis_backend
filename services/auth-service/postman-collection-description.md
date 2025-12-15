# Authentication Service API Guide

## Quick Start
This collection contains all authentication endpoints for user registration, login, and account management. All example request bodies can be found in the `bodies` folder.

## Available User Types
1. Customer (Regular users)
2. Company Admin (Manages company)
3. Shop Manager (Manages specific shops)
4. Worker (Shop staff)
5. Super Admin (System admin)

## How to Use

### 1. Registration
- Use `/auth/register` with role-specific bodies from `bodies/Registrations/`
- Each role has different required fields
- You'll receive verification codes in development mode

### 2. Login Options
a) Regular Login (Email/Phone + Password):
```json
{
    "identifier": "user@example.com",
    "password": "YourPassword"
}
```

b) OTP Login (Two steps):
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

### 3. Account Security
- 5 failed login attempts = 15-minute account lock
- OTPs expire in 15 minutes
- Each registration/login endpoint has rate limiting

### 4. Response Format
Success:
```json
{
    "ok": true,
    "accessToken": "jwt_token_here",
    "user": { ... }
}
```

Error:
```json
{
    "ok": false,
    "message": "Error description here"
}
```

## Common Issues
1. "User exists" - Email/Phone already registered
2. "Invalid credentials" - Wrong email/phone or password
3. "Account locked" - Too many failed attempts
4. "Rate limit exceeded" - Too many requests

## Testing Tips
1. Register users first
2. Note the verification codes (in development)
3. Try both email and phone login
4. Test failed attempts to see account locking

## Test Data
Use the example bodies in:
- `/bodies/Login/` for login requests
- `/bodies/Registrations/` for registration