import { StorageFactory } from './storage/storage.factory';
import { StorageProvider } from './storage/storage-provider.interface';
import { generateSecureFilename, sanitizeFilename } from '../middleware/security.middleware';

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface ProcessedImage {
  publicId: string;
  url: string;
  secureUrl: string;
  size: number;
  width: number;
  height: number;
}

class ImageService {
  private storageProvider: StorageProvider;

  constructor() {
    this.storageProvider = StorageFactory.getStorageProvider();
  }

  /**
   * Process and save an image with enhanced security
   */
  async processImage(
    buffer: Buffer,
    originalName: string,
    options: ImageProcessingOptions = {}
  ): Promise<ProcessedImage> {
    const {
      width = 800,
      height = 600,
      quality = 80,
      format = 'jpeg'
    } = options;

    // Validate image buffer first
    const isValid = await this.validateImage(buffer);
    if (!isValid) {
      throw new Error('Invalid image buffer');
    }

    // Sanitize the original filename for security
    const sanitizedName = sanitizeFilename(originalName);
    const secureFilename = generateSecureFilename(sanitizedName);

    try {
      const result = await this.storageProvider.uploadImage(buffer, {
        width,
        height,
        quality,
        format,
        folder: 'cuppa/general'
      });

      return {
        publicId: result.publicId,
        url: result.url,
        secureUrl: result.secureUrl,
        size: result.bytes,
        width: result.width,
        height: result.height
      };
    } catch (error) {
      console.error('Error processing image:', error);
      throw new Error('Failed to process and upload image');
    }
  }

  /**
   * Process profile image with specific dimensions and enhanced security
   */
  async processProfileImage(buffer: Buffer, originalName: string): Promise<ProcessedImage> {
    // Additional validation for profile images
    await this.validateProfileImageRequirements(buffer);

    const sanitizedName = sanitizeFilename(originalName);
    const secureFilename = generateSecureFilename(sanitizedName);

    const result = await this.storageProvider.uploadImage(buffer, {
      width: 400,
      height: 400,
      quality: 85,
      format: 'jpeg',
      folder: 'cuppa/profiles'
    });

    return {
      publicId: result.publicId,
      url: result.url,
      secureUrl: result.secureUrl,
      size: result.bytes,
      width: result.width,
      height: result.height
    };
  }

  /**
   * Process review images with specific dimensions and enhanced security
   */
  async processReviewImage(buffer: Buffer, originalName: string): Promise<ProcessedImage> {
    // Additional validation for review images
    await this.validateReviewImageRequirements(buffer);

    const sanitizedName = sanitizeFilename(originalName);
    const secureFilename = generateSecureFilename(sanitizedName);

    const result = await this.storageProvider.uploadImage(buffer, {
      width: 800,
      height: 600,
      quality: 80,
      format: 'jpeg',
      folder: 'cuppa/reviews'
    });

    return {
      publicId: result.publicId,
      url: result.url,
      secureUrl: result.secureUrl,
      size: result.bytes,
      width: result.width,
      height: result.height
    };
  }

  /**
   * Delete an image with enhanced security checks
   */
  async deleteImage(publicIdOrUrl: string): Promise<void> {
    try {
      // Validate the publicId/URL format to prevent injection attacks
      if (!this.isValidPublicIdOrUrl(publicIdOrUrl)) {
        throw new Error('Invalid public ID or URL format');
      }

      // If it's a URL, extract the public ID
      const publicId = this.extractPublicIdFromUrl(publicIdOrUrl) || publicIdOrUrl;
      await this.storageProvider.deleteImage(publicId);
    } catch (error) {
      console.error('Error deleting image:', error);
      // Don't throw error if image doesn't exist, but log suspicious attempts
      if (error instanceof Error && error.message.includes('Invalid')) {
        console.warn('Suspicious image deletion attempt:', publicIdOrUrl);
      }
    }
  }

  /**
   * Validate public ID or URL format for security
   */
  private isValidPublicIdOrUrl(input: string): boolean {
    // Check for basic format and prevent path traversal
    const suspiciousPatterns = [
      /\.\./,
      /\/\.\./,
      /\0/,
      /<script/i,
      /javascript:/i,
      /data:/i
    ];

    return !suspiciousPatterns.some(pattern => pattern.test(input)) && 
           input.length > 0 && 
           input.length < 500; // Reasonable length limit
  }

  /**
   * Enhanced validation for profile images
   */
  private async validateProfileImageRequirements(buffer: Buffer): Promise<void> {
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();

    // Profile images should be reasonably square for better display
    if (metadata.width && metadata.height) {
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio < 0.5 || aspectRatio > 2.0) {
        throw new Error('Profile image aspect ratio should be between 1:2 and 2:1');
      }
    }

    // Check for minimum quality (not too pixelated)
    if (metadata.width && metadata.width < 100) {
      throw new Error('Profile image resolution too low. Minimum 100px width required.');
    }
  }

  /**
   * Enhanced validation for review images
   */
  private async validateReviewImageRequirements(buffer: Buffer): Promise<void> {
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();

    // Review images should have reasonable dimensions
    if (metadata.width && metadata.height) {
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio < 0.25 || aspectRatio > 4.0) {
        throw new Error('Review image aspect ratio should be between 1:4 and 4:1');
      }
    }
  }

  /**
   * Extract public ID from URL (for Cloudinary URLs)
   */
  extractPublicIdFromUrl(url: string): string | null {
    // Validate URL format first
    if (!this.isValidPublicIdOrUrl(url)) {
      return null;
    }

    // For Cloudinary URLs: https://res.cloudinary.com/cloud/image/upload/v1234567890/folder/publicId.jpg
    const cloudinaryMatch = url.match(/\/v\d+\/(.+)\.[^.]+$/);
    if (cloudinaryMatch) {
      return cloudinaryMatch[1];
    }

    // For local URLs: http://localhost:5001/uploads/images/filename.jpg
    const localMatch = url.match(/\/uploads\/images\/(.+)$/);
    if (localMatch) {
      const filename = localMatch[1];
      // Remove extension to get publicId
      return filename.replace(/\.[^.]+$/, '');
    }

    return null;
  }

  /**
   * Extract filename from URL (legacy method for backward compatibility)
   */
  extractFilenameFromUrl(url: string): string | null {
    return this.extractPublicIdFromUrl(url);
  }

  /**
   * Enhanced image validation
   */
  async validateImage(buffer: Buffer): Promise<boolean> {
    try {
      // Try to get image info without processing
      const sharp = require('sharp');
      const metadata = await sharp(buffer).metadata();
      
      // Basic validation
      if (!metadata.width || !metadata.height) {
        return false;
      }

      // Check for reasonable file size vs dimensions ratio (detect suspicious files)
      const expectedMinSize = (metadata.width * metadata.height) / 10; // Very rough estimate
      if (buffer.length < expectedMinSize) {
        console.warn('Suspicious image: file size too small for dimensions');
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate URL with transformations
   */
  generateUrl(publicId: string, options: ImageProcessingOptions = {}): string {
    // Validate publicId before generating URL
    if (!this.isValidPublicIdOrUrl(publicId)) {
      throw new Error('Invalid public ID for URL generation');
    }
    
    return this.storageProvider.generateUrl(publicId, options);
  }
}

export default new ImageService(); 