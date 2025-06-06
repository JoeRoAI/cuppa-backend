import multer from 'multer';
import path from 'path';
import { Request } from 'express';

// Define allowed file types
const allowedFileTypes = /jpeg|jpg|png|webp/;
const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Configure multer storage
const storage = multer.memoryStorage(); // Store in memory for processing

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file extension
  const extname = allowedFileTypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime type
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, WebP) are allowed!'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Export different upload configurations
export const uploadSingle = upload.single('image');
export const uploadMultiple = upload.array('images', 5); // Max 5 images
export const uploadProfileImage = upload.single('profileImage');
export const uploadReviewImages = upload.array('reviewImages', 5);

export default upload;
