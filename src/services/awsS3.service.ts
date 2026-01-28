import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Readable } from 'stream';

// Environment variable validation
const validateEnvVars = () => {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET_NAME'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required AWS environment variables: ${missing.join(', ')}`);
  }
};

// Initialize S3 client with AWS SDK v3
validateEnvVars();

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Allowed file types and their MIME types
export const ALLOWED_FILE_TYPES = {
  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],

  // Audio (for lead notes)
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/webm': ['.webm'], // Browser recording format

  // Documents
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],

  // Text
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Validates file type and size
 */
export const validateFile = (file: Express.Multer.File): { valid: boolean; error?: string } => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  // Check MIME type
  if (!ALLOWED_FILE_TYPES[file.mimetype as keyof typeof ALLOWED_FILE_TYPES]) {
    return {
      valid: false,
      error: `File type '${file.mimetype}' is not allowed. Allowed types: ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}`,
    };
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ALLOWED_FILE_TYPES[file.mimetype as keyof typeof ALLOWED_FILE_TYPES];

  if (!allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `File extension '${ext}' does not match MIME type '${file.mimetype}'`,
    };
  }

  return { valid: true };
};

/**
 * Sanitize filename to prevent path traversal attacks
 */
const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe characters
    .replace(/\.+/g, '.') // Replace multiple dots
    .slice(0, 200); // Limit length
};

export interface UploadOptions {
  folder?: string;
  makePublic?: boolean;
  expiresIn?: number; // For signed URLs (in seconds)
}

export interface UploadResult {
  key: string;
  url: string;
  publicUrl?: string;
  bucket: string;
  size: number;
  contentType: string;
}

/**
 * Upload file to S3 using streams (memory efficient)
 */
export const uploadFileToS3 = async (
  file: Express.Multer.File,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  const { folder = 'uploads', makePublic = false, expiresIn = 3600 } = options;

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Generate unique filename
  const sanitizedName = sanitizeFilename(file.originalname);
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  const uniqueFilename = `${baseName}-${uuidv4()}${ext}`;
  const key = `${folder}/${uniqueFilename}`;

  // Prepare upload parameters
  // Note: ACL is not set here - rely on bucket-level policies instead
  // Modern S3 buckets have ACLs disabled by default for security
  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    // Add metadata
    Metadata: {
      'original-name': file.originalname,
      'uploaded-at': new Date().toISOString(),
    },
  };

  try {
    // Upload to S3
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // Prepare result
    const result: UploadResult = {
      key,
      url: '', // Will be set below
      bucket: process.env.AWS_S3_BUCKET_NAME!,
      size: file.size,
      contentType: file.mimetype,
    };

    if (makePublic) {
      // Public URL
      result.publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      result.url = result.publicUrl;
    } else {
      // Generate signed URL for private files
      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
      });
      result.url = await getSignedUrl(s3Client, getCommand, { expiresIn });
    }

    return result;
  } catch (error: any) {
    console.error('Error uploading file to S3:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Generate a new signed URL for an existing private file
 */
export const generateSignedUrl = async (
  key: string,
  expiresIn: number = 3600
): Promise<string> => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error: any) {
    console.error('Error generating signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Upload file from stream (useful for large files)
 */
export const uploadStreamToS3 = async (
  stream: Readable,
  filename: string,
  contentType: string,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  const { folder = 'uploads', makePublic = false, expiresIn = 3600 } = options;

  const sanitizedName = sanitizeFilename(filename);
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  const uniqueFilename = `${baseName}-${uuidv4()}${ext}`;
  const key = `${folder}/${uniqueFilename}`;

  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: stream,
    ContentType: contentType,
    // ACL not set - rely on bucket-level policies
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const result: UploadResult = {
      key,
      url: '',
      bucket: process.env.AWS_S3_BUCKET_NAME!,
      size: 0, // Size unknown for streams
      contentType,
    };

    if (makePublic) {
      result.publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      result.url = result.publicUrl;
    } else {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
      });
      result.url = await getSignedUrl(s3Client, getCommand, { expiresIn });
    }

    return result;
  } catch (error: any) {
    console.error('Error uploading stream to S3:', error);
    throw new Error(`Failed to upload stream to S3: ${error.message}`);
  }
};

/**
 * Upload CSV content to S3 (for exports)
 */
export const uploadCSVToS3 = async (
  csvContent: string,
  filename: string,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  const { folder = 'csv-exports', makePublic = true, expiresIn = 3600 } = options;

  // Generate unique filename
  const sanitizedName = sanitizeFilename(filename);
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  const uniqueFilename = `${baseName}-${uuidv4()}${ext}`;
  const key = `${folder}/${uniqueFilename}`;

  // Convert CSV string to buffer
  const buffer = Buffer.from(csvContent, 'utf-8');

  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: 'text/csv',
    ContentDisposition: `attachment; filename="${sanitizedName}"`,
    Metadata: {
      'original-name': filename,
      'uploaded-at': new Date().toISOString(),
      'export-type': 'csv',
    },
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const result: UploadResult = {
      key,
      url: '',
      bucket: process.env.AWS_S3_BUCKET_NAME!,
      size: buffer.length,
      contentType: 'text/csv',
    };

    if (makePublic) {
      // Public URL
      result.publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      result.url = result.publicUrl;
    } else {
      // Generate signed URL for private files
      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
      });
      result.url = await getSignedUrl(s3Client, getCommand, { expiresIn });
    }

    return result;
  } catch (error: any) {
    console.error('Error uploading CSV to S3:', error);
    throw new Error(`Failed to upload CSV to S3: ${error.message}`);
  }
};
