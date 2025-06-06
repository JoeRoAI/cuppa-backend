import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { StorageProvider, UploadOptions, UploadResult } from './storage-provider.interface';

export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'images');
    this.baseUrl = process.env.BASE_URL || 'http://localhost:5001';
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async uploadImage(buffer: Buffer, options: UploadOptions = {}): Promise<UploadResult> {
    const { width = 800, height = 600, quality = 80, format = 'jpeg' } = options;

    // Generate unique filename (this will be our publicId)
    const fileExtension = format === 'jpeg' ? 'jpg' : format;
    const publicId = `${uuidv4()}-${Date.now()}`;
    const filename = `${publicId}.${fileExtension}`;
    const filePath = path.join(this.uploadDir, filename);

    // Process image with sharp
    const processedBuffer = await sharp(buffer)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat(format as any, { quality })
      .toBuffer();

    // Save processed image
    await fs.writeFile(filePath, processedBuffer);

    // Get image metadata
    const metadata = await sharp(processedBuffer).metadata();

    const url = `${this.baseUrl}/uploads/images/${filename}`;

    return {
      publicId,
      url,
      secureUrl: url,
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || format,
      bytes: processedBuffer.length,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      // Find the file with this publicId
      const files = await fs.readdir(this.uploadDir);
      const fileToDelete = files.find((file) => file.startsWith(publicId));

      if (fileToDelete) {
        const filePath = path.join(this.uploadDir, fileToDelete);
        await fs.unlink(filePath);
      }
    } catch (error) {
      console.error('Local storage delete error:', error);
      // Don't throw error if file doesn't exist
    }
  }

  generateUrl(publicId: string, options: UploadOptions = {}): string {
    // For local storage, we can't dynamically transform images
    // So we just return the stored URL
    // In a real implementation, you might want to store multiple sizes
    return `${this.baseUrl}/uploads/images/${publicId}`;
  }

  isConfigured(): boolean {
    // Local storage is always "configured"
    return true;
  }
}
