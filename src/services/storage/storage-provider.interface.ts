export interface UploadOptions {
  folder?: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'auto';
}

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export interface StorageProvider {
  /**
   * Upload an image buffer to storage
   */
  uploadImage(buffer: Buffer, options?: UploadOptions): Promise<UploadResult>;

  /**
   * Delete an image from storage
   */
  deleteImage(publicId: string): Promise<void>;

  /**
   * Generate a URL for an image with transformations
   */
  generateUrl(publicId: string, options?: UploadOptions): string;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
} 