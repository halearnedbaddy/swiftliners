const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class FileService {
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.ensureUploadDirectory();
  }

  ensureUploadDirectory() {
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
    }
  }

  async uploadFile(fileData, subfolder = 'general') {
    try {
      // Handle base64 data or file object
      let buffer, filename, mimeType;

      if (typeof fileData === 'string') {
        // Base64 encoded data
        const matches = fileData.match(/^data:(.+?);base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid file data format');
        }

        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else if (fileData.buffer) {
        // File object with buffer
        buffer = fileData.buffer;
        mimeType = fileData.mimetype;
        filename = fileData.originalname;
      } else {
        throw new Error('Invalid file data');
      }

      // Validate file type
      if (!this.allowedMimeTypes.includes(mimeType)) {
        throw new Error(`File type ${mimeType} not allowed`);
      }

      // Validate file size
      if (buffer.length > this.maxFileSize) {
        throw new Error('File size exceeds 10MB limit');
      }

      // Generate filename
      if (!filename) {
        const ext = this.getFileExtension(mimeType);
        filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
      }

      // Create subfolder if it doesn't exist
      const targetDir = path.join(this.uploadDir, subfolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Save file
      const filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, buffer);

      // Generate public URL
      const publicUrl = `/uploads/${subfolder}/${filename}`;

      logger.info('File uploaded successfully', {
        filename,
        mimeType,
        size: buffer.length,
        path: publicUrl
      });

      return {
        filename,
        mimeType,
        size: buffer.length,
        url: publicUrl,
        path: filePath
      };

    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  async deleteFile(filePath) {
    try {
      const fullPath = path.join(process.cwd(), filePath);
      
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        logger.info('File deleted successfully', { path: filePath });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw error;
    }
  }

  getFileExtension(mimeType) {
    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
    };

    return extensions[mimeType] || '.bin';
  }

  validateImageFile(buffer) {
    // Basic image validation using magic numbers
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46]
    };

    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (buffer.length >= signature.length &&
          signature.every((byte, index) => buffer[index] === byte)) {
        return mimeType;
      }
    }

    return null;
  }

  async uploadKYCDocument(fileData, userId, documentType) {
    try {
      const result = await this.uploadFile(fileData, `kyc/${userId}`);
      
      // Log KYC document upload for audit
      logger.info('KYC document uploaded', {
        userId,
        documentType,
        filename: result.filename,
        size: result.size,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error('KYC document upload failed:', {
        userId,
        documentType,
        error: error.message
      });
      throw error;
    }
  }

  // Serve static files (for development)
  serveStaticFile(req, res, next) {
    try {
      const filePath = req.path.replace('/uploads', '');
      const fullPath = path.join(this.uploadDir, filePath);

      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        
        // Set appropriate headers
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', this.getContentType(path.extname(fullPath)));
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year

        // Stream file
        const fileStream = fs.createReadStream(fullPath);
        fileStream.pipe(res);
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (error) {
      logger.error('Static file serving failed:', error);
      res.status(500).json({ error: 'Failed to serve file' });
    }
  }

  getContentType(extension) {
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  // Clean up old files (for maintenance)
  async cleanupOldFiles(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      const files = fs.readdirSync(this.uploadDir, { recursive: true });
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile() && (now - stat.mtime.getTime()) > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      logger.info('File cleanup completed', {
        deletedCount,
        maxAge: `${maxAge / (24 * 60 * 60 * 1000)} days`
      });

      return deletedCount;
    } catch (error) {
      logger.error('File cleanup failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
const fileService = new FileService();

// Export main function for backward compatibility
const uploadFile = (fileData, subfolder) => fileService.uploadFile(fileData, subfolder);

module.exports = {
  FileService,
  fileService,
  uploadFile
};
