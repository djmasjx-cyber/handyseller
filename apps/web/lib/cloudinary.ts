/**
 * Yandex Object Storage (S3) client-side upload helper.
 * Handles direct browser-to-S3 uploads using presigned URLs from our API.
 */

export interface UploadSignature {
  /** Presigned URL for PUT upload */
  uploadUrl: string;
  /** Public URL after upload completes */
  publicUrl: string;
  /** Object key in S3 */
  key: string;
  /** Expiration time in seconds */
  expiresIn: number;
}

export interface UploadResult {
  url: string;
  key: string;
  size?: number;
  contentType?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Get auth token from localStorage.
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

/**
 * Fetch upload signature (presigned URL) from our API.
 */
export async function getUploadSignature(
  filename: string,
  contentType: string = 'image/jpeg',
): Promise<UploadSignature> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Требуется авторизация');
  }

  const response = await fetch('/api/media/upload-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filename, contentType }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Не удалось получить URL для загрузки');
  }

  return response.json();
}

/**
 * Upload a file directly to S3 using presigned URL.
 * Returns the public URL after upload.
 */
export async function uploadToStorage(
  file: File,
  signature: UploadSignature,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signature.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // S3 PUT returns empty response on success
        // Optionally confirm with our API
        try {
          const token = getAuthToken();
          const confirmResponse = await fetch('/api/media/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ key: signature.key }),
          });

          if (confirmResponse.ok) {
            const result = await confirmResponse.json();
            resolve(result);
          } else {
            // Fallback to presigned URL info
            resolve({
              url: signature.publicUrl,
              key: signature.key,
              size: file.size,
              contentType: file.type,
            });
          }
        } catch {
          // Fallback to presigned URL info
          resolve({
            url: signature.publicUrl,
            key: signature.key,
            size: file.size,
            contentType: file.type,
          });
        }
      } else {
        reject(new Error(`Ошибка загрузки: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Ошибка сети при загрузке'));
    xhr.ontimeout = () => reject(new Error('Превышено время ожидания загрузки'));
    xhr.timeout = 120000; // 2 minutes

    xhr.send(file);
  });
}

/**
 * Upload multiple files with progress tracking.
 */
export async function uploadMultipleFiles(
  files: File[],
  onFileProgress?: (index: number, progress: UploadProgress) => void,
  onFileComplete?: (index: number, result: UploadResult) => void,
  onFileError?: (index: number, error: Error) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      // Get signature for each file (different filename/type)
      const signature = await getUploadSignature(files[i].name, files[i].type);
      
      const result = await uploadToStorage(
        files[i],
        signature,
        (progress) => onFileProgress?.(i, progress),
      );
      results.push(result);
      onFileComplete?.(i, result);
    } catch (error) {
      onFileError?.(i, error as Error);
    }
  }

  return results;
}

/**
 * Check if storage upload is available.
 */
export async function isStorageEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/media/status');
    if (response.ok) {
      const data = await response.json();
      return data.storageEnabled === true;
    }
    return false;
  } catch {
    return false;
  }
}

// Alias for backward compatibility
export const isCloudinaryEnabled = isStorageEnabled;

/**
 * Validate file before upload.
 */
export function validateFile(
  file: File,
  options?: {
    maxSizeMB?: number;
    allowedTypes?: string[];
  },
): { valid: boolean; error?: string } {
  const maxSizeMB = options?.maxSizeMB ?? 10;
  const allowedTypes = options?.allowedTypes ?? [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Неподдерживаемый формат. Разрешены: ${allowedTypes.map((t) => t.split('/')[1]).join(', ')}`,
    };
  }

  if (file.size > maxSizeMB * 1024 * 1024) {
    return {
      valid: false,
      error: `Файл слишком большой. Максимум: ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

// Re-export for backward compatibility with old import names
export { uploadToStorage as uploadToCloudinary };
