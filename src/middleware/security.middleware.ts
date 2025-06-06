import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import crypto from 'crypto';

interface AuthenticatedRequest extends Request {
  user?: any;
}

// Rate limiting for image uploads (in-memory store for demo)
const uploadAttempts = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiting middleware for image uploads
 */
export const rateLimitImageUploads = (
  maxUploads: number = 10,
  windowMs: number = 15 * 60 * 1000
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const now = Date.now();
    const userAttempts = uploadAttempts.get(userId);

    if (!userAttempts || now > userAttempts.resetTime) {
      // Reset or initialize counter
      uploadAttempts.set(userId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (userAttempts.count >= maxUploads) {
      res.status(429).json({
        success: false,
        message: 'Too many upload attempts. Please try again later.',
        retryAfter: Math.ceil((userAttempts.resetTime - now) / 1000),
      });
      return;
    }

    // Increment counter
    userAttempts.count++;
    uploadAttempts.set(userId, userAttempts);
    next();
  };
};

/**
 * Advanced file validation middleware
 */
export const validateImageFile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file;

    const filesToValidate = files || (file ? [file] : []);

    if (filesToValidate.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No files provided for validation',
      });
      return;
    }

    for (const fileToValidate of filesToValidate) {
      // 1. Check file size (already handled by multer, but double-check)
      if (fileToValidate.size > 5 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          message: `File ${fileToValidate.originalname} exceeds 5MB limit`,
        });
        return;
      }

      // 2. Validate MIME type and file signature
      const isValidMimeType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(
        fileToValidate.mimetype
      );
      if (!isValidMimeType) {
        res.status(400).json({
          success: false,
          message: `Invalid file type: ${fileToValidate.mimetype}. Only JPEG, PNG, and WebP are allowed.`,
        });
        return;
      }

      // 3. Check file signature (magic bytes) to prevent MIME type spoofing
      const isValidSignature = await validateFileSignature(
        fileToValidate.buffer,
        fileToValidate.mimetype
      );
      if (!isValidSignature) {
        res.status(400).json({
          success: false,
          message: `File ${fileToValidate.originalname} has invalid file signature`,
        });
        return;
      }

      // 4. Validate image metadata using Sharp
      try {
        const metadata = await sharp(fileToValidate.buffer).metadata();

        // Check minimum dimensions
        if (!metadata.width || !metadata.height || metadata.width < 50 || metadata.height < 50) {
          res.status(400).json({
            success: false,
            message: `Image ${fileToValidate.originalname} is too small. Minimum size is 50x50 pixels.`,
          });
          return;
        }

        // Check maximum dimensions
        if (metadata.width > 4096 || metadata.height > 4096) {
          res.status(400).json({
            success: false,
            message: `Image ${fileToValidate.originalname} is too large. Maximum size is 4096x4096 pixels.`,
          });
          return;
        }

        // Validate format matches MIME type
        const expectedFormats = {
          'image/jpeg': ['jpeg', 'jpg'],
          'image/jpg': ['jpeg', 'jpg'],
          'image/png': ['png'],
          'image/webp': ['webp'],
        };

        const allowedFormats =
          expectedFormats[fileToValidate.mimetype as keyof typeof expectedFormats];
        if (!allowedFormats || !allowedFormats.includes(metadata.format || '')) {
          res.status(400).json({
            success: false,
            message: `File format mismatch for ${fileToValidate.originalname}`,
          });
          return;
        }
      } catch (error) {
        res.status(400).json({
          success: false,
          message: `Invalid or corrupted image: ${fileToValidate.originalname}`,
        });
        return;
      }

      // 5. Check for potentially malicious content
      const hasSuspiciousContent = await checkForSuspiciousContent(fileToValidate.buffer);
      if (hasSuspiciousContent) {
        res.status(400).json({
          success: false,
          message: `File ${fileToValidate.originalname} contains suspicious content`,
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('Error in file validation:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating uploaded files',
    });
  }
};

/**
 * Validate file signature (magic bytes)
 */
async function validateFileSignature(buffer: Buffer, mimeType: string): Promise<boolean> {
  const signatures = {
    'image/jpeg': [
      [0xff, 0xd8, 0xff], // JPEG
    ],
    'image/jpg': [
      [0xff, 0xd8, 0xff], // JPEG
    ],
    'image/png': [
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
    ],
    'image/webp': [
      [0x52, 0x49, 0x46, 0x46], // RIFF (WebP container)
    ],
  };

  const expectedSignatures = signatures[mimeType as keyof typeof signatures];
  if (!expectedSignatures) return false;

  return expectedSignatures.some((signature) => {
    if (buffer.length < signature.length) return false;
    return signature.every((byte, index) => buffer[index] === byte);
  });
}

/**
 * Check for suspicious content in image files
 */
async function checkForSuspiciousContent(buffer: Buffer): Promise<boolean> {
  // Convert buffer to string for text-based checks
  const content = buffer.toString('binary');

  // Check for common script tags and suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /<iframe/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /eval\(/i,
    /document\./i,
    /window\./i,
    /%3Cscript/i, // URL encoded <script
    /\x00/, // Null bytes
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(content));
}

/**
 * Sanitize filename to prevent path traversal
 */
export const sanitizeFilename = (filename: string): string => {
  // Remove path separators and dangerous characters
  return filename
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .replace(/^\.+/, '')
    .trim()
    .substring(0, 255); // Limit length
};

/**
 * Generate secure random filename
 */
export const generateSecureFilename = (originalName: string): string => {
  const ext = originalName.split('.').pop()?.toLowerCase() || '';
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return `${timestamp}-${randomBytes}.${ext}`;
};

/**
 * Content Security Policy headers for image responses
 */
export const setImageSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  next();
};

/**
 * Validate user permissions for specific operations
 */
export const validateImagePermissions = (operation: 'upload' | 'delete') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    // Check if user account is active/verified
    if (req.user.status === 'suspended' || req.user.status === 'banned') {
      res.status(403).json({
        success: false,
        message: 'Account suspended. Cannot perform image operations.',
      });
      return;
    }

    // Additional permission checks can be added here
    // For example, checking user role, subscription status, etc.

    next();
  };
};
