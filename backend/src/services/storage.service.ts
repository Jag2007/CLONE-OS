// src/services/storage.service.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';

export class StorageService {
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  // Used for OpenAI (URL-based)
  async uploadFromUrl(url: string, path: string): Promise<string> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      // Reuse the logic below
      return this.uploadBuffer(response.data, path, response.headers['content-type']);
    } catch (error) {
      console.error('Storage download error:', error);
      throw new Error('Failed to download image from external URL');
    }
  }

  // Used for Python API (Raw Data) - NEW METHOD
  async uploadBuffer(buffer: Buffer | ArrayBuffer, objectPath: string, contentType: string = 'image/png'): Promise<string> {
    if (config.storage.driver === 'freeimage') {
      if (contentType.startsWith('image/')) {
        return this.uploadToFreeImage(buffer);
      }
      // Fallback to local storage for videos and other non-image assets
      return this.uploadBufferLocally(buffer, objectPath);
    }
    if (config.storage.driver === 'local') {
      return this.uploadBufferLocally(buffer, objectPath);
    }

    try {
      const command = new PutObjectCommand({
        Bucket: config.aws.bucketName,
        Key: objectPath,
        Body: buffer as Buffer, // Ensure correct typing
        ContentType: contentType,
      });

      await this.s3.send(command);

      // Return the permanent S3 URL
      return `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${objectPath}`;
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new Error('Failed to upload image to storage');
    }
  }

  private async uploadToFreeImage(buffer: Buffer | ArrayBuffer): Promise<string> {
    try {
      const base64 = Buffer.isBuffer(buffer)
        ? buffer.toString('base64')
        : Buffer.from(buffer).toString('base64');

      const formData = new URLSearchParams();
      formData.append('source', base64);
      formData.append('action', 'upload');

      const apiKey = config.workers.videoImageHostApiKey || '6d207e02198a847aa98d0a2a901485a5';
      const url = `${config.workers.videoImageHostApiUrl || 'https://freeimage.host/api/1/upload'}?key=${apiKey}`;

      const response = await axios.post(url, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data && response.data.image && response.data.image.url) {
        return response.data.image.url;
      }
      throw new Error('Invalid response from freeimage.host: ' + JSON.stringify(response.data));
    } catch (error: any) {
      console.error('FreeImage upload error:', error.message);
      throw new Error('Failed to upload image to freeimage.host: ' + error.message);
    }
  }

  private async uploadBufferLocally(buffer: Buffer | ArrayBuffer, objectPath: string): Promise<string> {
    const normalizedPath = objectPath
      .replace(/^\/+/, '')
      .replace(/\.\.+/g, '')
      .replace(/\\/g, '/');
    const uploadRoot = path.resolve(process.cwd(), 'uploads');
    const targetPath = path.resolve(uploadRoot, normalizedPath);

    if (!targetPath.startsWith(uploadRoot)) {
      throw new Error('Invalid local storage path');
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const bytes = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(new Uint8Array(buffer));
    await fs.writeFile(targetPath, bytes);

    return `${config.storage.backendPublicUrl}/uploads/${normalizedPath}`;
  }
}
