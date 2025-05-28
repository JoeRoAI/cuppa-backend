# Cloudinary Image Storage Setup

This document explains how to configure Cloudinary for image storage in the Cuppa backend.

## Overview

The application uses a storage provider abstraction that automatically chooses between:
1. **Cloudinary** (cloud storage) - preferred for production
2. **Local storage** (fallback) - used for development when Cloudinary is not configured

## Cloudinary Configuration

### 1. Create a Cloudinary Account
1. Go to [Cloudinary](https://cloudinary.com/) and create a free account
2. Navigate to your dashboard to get your credentials

### 2. Environment Variables
Add these variables to your `.env` file:

```bash
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### 3. Get Your Credentials
From your Cloudinary dashboard:
- **Cloud Name**: Found in the dashboard URL or account details
- **API Key**: Found in the "Account Details" section
- **API Secret**: Found in the "Account Details" section (click "Reveal")

## Storage Provider Features

### Cloudinary Provider
- **Image optimization**: Automatic compression and format conversion
- **Transformations**: Dynamic resizing and quality adjustments
- **CDN delivery**: Fast global content delivery
- **Folder organization**: Images organized by type (profiles, reviews)
- **Secure URLs**: HTTPS delivery by default

### Local Storage Provider (Fallback)
- **Development friendly**: No external dependencies
- **Image processing**: Uses Sharp for resizing and optimization
- **File organization**: Stores in `uploads/images/` directory
- **Unique filenames**: UUID-based naming to prevent conflicts

## Image Processing

### Profile Images
- **Size**: 400x400 pixels
- **Quality**: 85%
- **Format**: JPEG
- **Folder**: `cuppa/profiles`

### Review Images
- **Size**: 800x600 pixels
- **Quality**: 80%
- **Format**: JPEG
- **Folder**: `cuppa/reviews`

## API Endpoints

### Profile Images
- `POST /api/images/profile` - Upload profile image
- `DELETE /api/images/profile` - Delete profile image

### Review Images
- `POST /api/images/review/:ratingId` - Upload review images
- `DELETE /api/images/review/:ratingId/:imageUrl` - Delete specific review image

## Testing the Setup

1. **Check provider status**: The application logs which provider is being used on startup
2. **Test upload**: Use the API endpoints to upload test images
3. **Verify storage**: Check your Cloudinary media library or local uploads folder

## Troubleshooting

### Cloudinary Not Working
- Verify environment variables are set correctly
- Check Cloudinary dashboard for API usage limits
- Ensure your account is active and verified

### Local Storage Issues
- Check file permissions on the uploads directory
- Verify Sharp dependency is installed
- Ensure sufficient disk space

## Security Considerations

- **File validation**: Only JPEG, PNG, and WebP files are accepted
- **Size limits**: 5MB maximum file size
- **Authentication**: All endpoints require user authentication
- **Authorization**: Users can only manage their own images 