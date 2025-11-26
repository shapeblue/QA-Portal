# Security Policy

## Security Measures

This document outlines the security measures implemented in the QA Portal application.

### 1. SQL Injection Prevention

✅ **Parameterized Queries**: All database queries use parameterized statements via MySQL2
- User input is never directly concatenated into SQL queries
- All query parameters are properly escaped by the database driver
- Uses prepared statements for all dynamic queries

Example:
```typescript
const query = 'SELECT * FROM users WHERE id = ?';
await pool.query(query, [userId]); // Safe - parameterized
```

### 2. Cross-Site Scripting (XSS) Prevention

✅ **React Auto-Escaping**: React automatically escapes all rendered content
- All user-generated content is escaped by default
- No use of `dangerouslySetInnerHTML` in the codebase
- All data displayed through JSX is sanitized

✅ **Content Security Policy**: Recommended headers (see deployment section)

### 3. Cross-Site Request Forgery (CSRF)

✅ **CORS Configuration**: Properly configured CORS middleware
- Limited to specific origins in production
- Credentials handling is controlled

✅ **SameSite Cookies**: Recommended for session management

### 4. Authentication & Authorization

⚠️ **Current State**: Application is read-only and displays public data
- No user authentication implemented (data is public test results)
- No write operations exposed through API
- Database user has read-only permissions

🔒 **Future Enhancements**: 
- Add authentication if write operations are needed
- Implement rate limiting for API endpoints
- Add API key authentication for programmatic access

### 5. Environment Variables

✅ **Secrets Management**:
- Database credentials stored in `.env` file
- `.env` file is git-ignored
- `.env.example` provided without sensitive data
- Environment variables never logged or exposed

### 6. Dependencies

✅ **Vulnerability Scanning**:
```bash
# Run npm audit regularly
cd client && npm audit
cd server && npm audit

# Fix vulnerabilities automatically
npm audit fix
```

✅ **Keep Dependencies Updated**:
- Regular updates to patch security vulnerabilities
- Use `npm outdated` to check for updates

### 7. Input Validation

✅ **Server-Side Validation**:
- PR numbers validated as integers
- Query parameters sanitized
- File paths validated (no path traversal)

✅ **Client-Side Validation**:
- Input fields have type checking
- URL validation before external links

### 8. Secure Headers

Recommended HTTP security headers for production deployment:

```nginx
# nginx configuration
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" always;
```

### 9. Database Security

✅ **Connection Security**:
- Use SSL/TLS for database connections in production
- Limit database user permissions (read-only recommended)
- Use separate credentials for different environments

✅ **Network Security**:
- Database should not be publicly accessible
- Use VPN or SSH tunneling for remote access
- Firewall rules to limit database access

### 10. Logging & Monitoring

✅ **Security Logging**:
- Failed database connections logged
- Error logging without exposing sensitive data
- No credentials in logs

⚠️ **Recommendations**:
- Implement rate limiting on API endpoints
- Add request logging for audit trails
- Set up monitoring for unusual patterns

## Reporting Security Issues

If you discover a security vulnerability, please email: security@shapeblue.com

**Please do not create public GitHub issues for security vulnerabilities.**

## Security Checklist for Deployment

Before deploying to production:

- [ ] All dependencies updated and audited (`npm audit`)
- [ ] Environment variables properly configured
- [ ] Database user has minimum required permissions
- [ ] Database connection uses SSL/TLS
- [ ] HTTPS enabled for web traffic
- [ ] Security headers configured in nginx/apache
- [ ] Rate limiting enabled
- [ ] Firewall rules configured
- [ ] Regular backups enabled
- [ ] Monitoring and alerting configured
- [ ] `.env` file has restricted permissions (600)
- [ ] Server logs rotation configured

## Secure Deployment Example

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment instructions with security best practices.

## License

This security policy is part of the QA Portal project.
Last updated: 2025-11-26
