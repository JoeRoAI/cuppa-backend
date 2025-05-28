import { v2 as cloudinary } from 'cloudinary';
import { StorageProvider, UploadOptions, UploadResult } from './storage-provider.interface';

export class CloudinaryStorageProvider implements StorageProvider {
  constructor() {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async uploadImage(buffer: Buffer, options: UploadOptions = {}): Promise<UploadResult> {
    const {
      folder = 'cuppa',
      width,
      height,
      quality = 'auto',
      format = 'auto'
    } = options;

    // Build transformation options
    const transformation: any = {
      quality,
      format,
    };

    if (width && height) {
      transformation.width = width;
      transformation.height = height;
      transformation.crop = 'limit';
    }

    try {
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder,
            transformation,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(buffer);
      });

      return {
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload image to Cloudinary');
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      // Don't throw error if image doesn't exist
    }
  }

  generateUrl(publicId: string, options: UploadOptions = {}): string {
    const {
      width,
      height,
      quality = 'auto',
      format = 'auto'
    } = options;

    const transformation: any = {
      quality,
      format,
    };

    if (width && height) {
      transformation.width = width;
      transformation.height = height;
      transformation.crop = 'limit';
    }

    return cloudinary.url(publicId, {
      transformation,
      secure: true,
    });
  }

  isConfigured(): boolean {
    return !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }
} 