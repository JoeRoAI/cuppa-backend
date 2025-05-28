# Image Upload Security Documentation

This document outlines the comprehensive security measures implemented for image uploads in the Cuppa backend.

## Security Layers

### 1. Authentication & Authorization
- **Authentication Required**: All image endpoints require valid JWT authentication
- **User Verification**: Users can only upload/delete their own profile images
- **Rating Ownership**: Users can only upload images to their own coffee reviews
- **Account Status Check**: Suspended or banned accounts cannot perform image operations

### 2. Rate Limiting
- **Profile Images**: 5 uploads per 15 minutes per user
- **Review Images**: 10 uploads per 15 minutes per user
- **In-Memory Tracking**: Rate limits are tracked per user ID
- **Automatic Reset**: Counters reset after the time window expires

### 3. File Validation

#### Basic Validation
- **File Size**: Maximum 5MB per file
- **File Types**: Only JPEG, PNG, and WebP formats allowed
- **MIME Type Check**: Validates both file extension and MIME type
- **Multiple Files**: Support for batch validation of multiple files

#### Advanced Validation
- **Magic Bytes**: Validates file signatures to prevent MIME type spoofing
  - JPEG: `FF D8 FF`
  - PNG: `89 50 4E 47 0D 0A 1A 0A`
  - WebP: `52 49 46 46` (RIFF)
- **Image Metadata**: Uses Sharp to validate image structure and metadata
- **Dimension Limits**: 
  - Minimum: 50x50 pixels
  - Maximum: 4096x4096 pixels
- **Format Consistency**: Ensures file format matches MIME type

#### Content Security
- **Malicious Content Detection**: Scans for embedded scripts and suspicious patterns
- **Script Tag Detection**: Checks for `<script>`, `<iframe>`, JavaScript, etc.
- **Null Byte Detection**: Prevents null byte injection attacks
- **URL Encoding Check**: Detects URL-encoded malicious content

### 4. Image Processing Security

#### Profile Images
- **Aspect Ratio**: Must be between 1:2 and 2:1 for proper display
- **Minimum Resolution**: 100px width minimum to ensure quality
- **Standardized Output**: 400x400px, 85% quality, JPEG format

#### Review Images
- **Aspect Ratio**: Must be between 1:4 and 4:1 for reasonable display
- **Standardized Output**: 800x600px, 80% quality, JPEG format

### 5. Filename Security
- **Sanitization**: Removes dangerous characters and path separators
- **Secure Generation**: Uses timestamp + crypto random bytes
- **Path Traversal Prevention**: Blocks `../` and similar patterns
- **Length Limits**: Maximum 255 characters

### 6. Storage Security
- **Public ID Validation**: Validates format before storage operations
- **URL Validation**: Prevents injection attacks in URL parameters
- **Secure Deletion**: Validates identifiers before deletion
- **Suspicious Activity Logging**: Logs potential attack attempts

### 7. HTTP Security Headers
- **X-Content-Type-Options**: `nosniff` - Prevents MIME type sniffing
- **X-Frame-Options**: `DENY` - Prevents clickjacking
- **Content-Security-Policy**: Restricts content sources

## Security Patterns Detected

The system actively detects and blocks:
- **MIME Type Spoofing**: Files with mismatched extensions and MIME types
- **Embedded Scripts**: HTML/JavaScript code hidden in image files
- **Path Traversal**: Attempts to access files outside allowed directories
- **Null Byte Injection**: Attempts to bypass file extension checks
- **Oversized Files**: Files exceeding size limits
- **Malformed Images**: Corrupted or invalid image data
- **Suspicious Dimensions**: Images with unrealistic size-to-dimension ratios

## Rate Limiting Details

### Implementation
```typescript
// Profile images: 5 uploads per 15 minutes
rateLimitImageUploads(5, 15 * 60 * 1000)

// Review images: 10 uploads per 15 minutes  
rateLimitImageUploads(10, 15 * 60 * 1000)
```

### Response Format
```json
{
  "success": false,
  "message": "Too many upload attempts. Please try again later.",
  "retryAfter": 900
}
```

## Error Handling

### Validation Errors
- **File Size**: "File exceeds 5MB limit"
- **File Type**: "Invalid file type. Only JPEG, PNG, and WebP are allowed"
- **File Signature**: "File has invalid file signature"
- **Dimensions**: "Image is too small/large"
- **Content**: "File contains suspicious content"

### Security Errors
- **Authentication**: "Authentication required"
- **Authorization**: "Not authorized to upload images for this rating"
- **Account Status**: "Account suspended. Cannot perform image operations"
- **Rate Limit**: "Too many upload attempts. Please try again later"

## Monitoring & Logging

### Security Events Logged
- Invalid file signature attempts
- Suspicious content detection
- Rate limit violations
- Unauthorized access attempts
- Malformed URL/ID attempts

### Log Format
```
WARN: Suspicious image deletion attempt: [suspicious_input]
WARN: Suspicious image: file size too small for dimensions
ERROR: Invalid file signature for file: [filename]
```

## Best Practices

### For Developers
1. Always validate user permissions before file operations
2. Use the security middleware in the correct order
3. Log suspicious activities for monitoring
4. Keep file size limits reasonable
5. Regularly update security patterns

### For Users
1. Use standard image formats (JPEG, PNG, WebP)
2. Keep file sizes under 5MB
3. Ensure images have reasonable dimensions
4. Don't attempt to upload non-image files

## Security Testing

### Test Cases
1. **File Type Bypass**: Attempt to upload non-image files with image extensions
2. **MIME Spoofing**: Upload files with mismatched MIME types and extensions
3. **Oversized Files**: Test file size limits
4. **Malicious Content**: Upload images with embedded scripts
5. **Path Traversal**: Attempt directory traversal in filenames
6. **Rate Limiting**: Test upload frequency limits
7. **Authorization**: Attempt to upload to other users' resources

### Security Checklist
- [ ] Authentication required for all endpoints
- [ ] Rate limiting active and tested
- [ ] File validation catches malicious files
- [ ] MIME type spoofing prevented
- [ ] Path traversal blocked
- [ ] Suspicious content detected
- [ ] Security headers set correctly
- [ ] Error messages don't leak sensitive information
- [ ] Logging captures security events

## Future Enhancements

### Potential Improvements
1. **Virus Scanning**: Integration with antivirus APIs
2. **Machine Learning**: AI-based malicious content detection
3. **Distributed Rate Limiting**: Redis-based rate limiting for scalability
4. **Image Watermarking**: Automatic watermark application
5. **EXIF Data Stripping**: Remove potentially sensitive metadata
6. **Content Moderation**: Automated inappropriate content detection

### Monitoring Enhancements
1. **Real-time Alerts**: Immediate notification of security events
2. **Analytics Dashboard**: Security metrics and trends
3. **Automated Blocking**: IP-based blocking for repeated violations
4. **Audit Trails**: Comprehensive logging for compliance 