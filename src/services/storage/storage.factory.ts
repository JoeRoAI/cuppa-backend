import { StorageProvider } from './storage-provider.interface';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';

export class StorageFactory {
  private static instance: StorageProvider | null = null;

  static getStorageProvider(): StorageProvider {
    if (!this.instance) {
      this.instance = this.createStorageProvider();
    }
    return this.instance;
  }

  private static createStorageProvider(): StorageProvider {
    // Try Cloudinary first if configured
    const cloudinaryProvider = new CloudinaryStorageProvider();
    if (cloudinaryProvider.isConfigured()) {
      console.log('Using Cloudinary storage provider');
      return cloudinaryProvider;
    }

    // Fall back to local storage
    console.log('Using local storage provider (Cloudinary not configured)');
    return new LocalStorageProvider();
  }

  // For testing purposes
  static setStorageProvider(provider: StorageProvider): void {
    this.instance = provider;
  }

  // Reset the instance (useful for testing)
  static reset(): void {
    this.instance = null;
  }
}
