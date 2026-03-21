"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, X, Loader2, ImagePlus, AlertCircle } from "lucide-react";
import {
  uploadToStorage,
  getUploadSignature,
  validateFile,
  isStorageEnabled,
  type UploadProgress,
} from "@/lib/cloudinary";

interface ImageUploadProps {
  /** Callback when images are uploaded. Receives array of URLs. */
  onUpload: (urls: string[]) => void;
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Maximum file size in MB */
  maxSizeMB?: number;
  /** Existing image URLs to display */
  existingUrls?: string[];
  /** Show URL input field */
  showUrlInput?: boolean;
  /** Callback when URL is added manually */
  onUrlAdd?: (url: string) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Class name for container */
  className?: string;
}

interface UploadingFile {
  file: File;
  progress: number;
  error?: string;
  previewUrl?: string;
}

export function ImageUpload({
  onUpload,
  maxFiles = 10,
  maxSizeMB = 10,
  existingUrls = [],
  showUrlInput = true,
  onUrlAdd,
  disabled = false,
  className = "",
}: ImageUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [storageEnabled, setStorageEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if storage is enabled on mount
  useEffect(() => {
    isStorageEnabled().then(setStorageEnabled);
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return;
      setError(null);

      const fileArray = Array.from(files);
      const remainingSlots = maxFiles - existingUrls.length - uploadingFiles.length;

      if (fileArray.length > remainingSlots) {
        setError(`Можно загрузить ещё ${remainingSlots} фото (максимум ${maxFiles})`);
        return;
      }

      // Validate files
      const validFiles: File[] = [];
      for (const file of fileArray) {
        const validation = validateFile(file, { maxSizeMB });
        if (!validation.valid) {
          setError(validation.error || "Ошибка валидации файла");
          return;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      // Add files to uploading state with previews
      const newUploadingFiles: UploadingFile[] = validFiles.map((file) => ({
        file,
        progress: 0,
        previewUrl: URL.createObjectURL(file),
      }));
      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      try {
        const uploadedUrls: string[] = [];

        for (let i = 0; i < validFiles.length; i++) {
          const file = validFiles[i];
          try {
            // Get presigned URL for each file
            const signature = await getUploadSignature(file.name, file.type);
            
            const result = await uploadToStorage(
              file,
              signature,
              (progress: UploadProgress) => {
                setUploadingFiles((prev) =>
                  prev.map((uf) =>
                    uf.file === file ? { ...uf, progress: progress.percent } : uf
                  )
                );
              }
            );
            uploadedUrls.push(result.url);
          } catch (err) {
            setUploadingFiles((prev) =>
              prev.map((uf) =>
                uf.file === file
                  ? { ...uf, error: err instanceof Error ? err.message : "Ошибка загрузки" }
                  : uf
              )
            );
          }
        }

        // Remove completed uploads from state
        setUploadingFiles((prev) =>
          prev.filter((uf) => !validFiles.includes(uf.file) || uf.error)
        );

        // Notify parent of successful uploads
        if (uploadedUrls.length > 0) {
          onUpload(uploadedUrls);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
        // Clear uploading files on signature error
        setUploadingFiles((prev) =>
          prev.filter((uf) => !validFiles.includes(uf.file))
        );
      }
    },
    [disabled, maxFiles, maxSizeMB, existingUrls.length, uploadingFiles.length, onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUrlSubmit = useCallback(() => {
    if (!urlInput.trim()) return;
    const url = urlInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("URL должен начинаться с http:// или https://");
      return;
    }
    setError(null);
    if (onUrlAdd) {
      onUrlAdd(url);
    } else {
      onUpload([url]);
    }
    setUrlInput("");
  }, [urlInput, onUrlAdd, onUpload]);

  const removeUploadingFile = useCallback((file: File) => {
    setUploadingFiles((prev) => {
      const item = prev.find((uf) => uf.file === file);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((uf) => uf.file !== file);
    });
  }, []);

  const totalImages = existingUrls.length + uploadingFiles.length;
  const canUploadMore = totalImages < maxFiles;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Drop zone */}
      {canUploadMore && storageEnabled && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
            transition-colors duration-200
            ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              {isDragging ? (
                <ImagePlus className="w-6 h-6 text-primary" />
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {isDragging ? "Отпустите для загрузки" : "Перетащите фото сюда"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                или нажмите для выбора • до {maxSizeMB}MB • JPG, PNG, WebP, GIF
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Storage not configured message */}
      {storageEnabled === false && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Загрузка фото не настроена</p>
              <p className="text-xs text-amber-700 mt-1">
                Используйте URL-ссылки на фото или обратитесь к администратору для настройки Cloudinary.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="Или вставьте URL фото (http://...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
            disabled={disabled || !canUploadMore}
            className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            disabled={disabled || !urlInput.trim() || !canUploadMore}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Добавить
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-md">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Uploading files preview */}
      {uploadingFiles.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {uploadingFiles.map((uf, idx) => (
            <div
              key={`uploading-${idx}`}
              className="relative aspect-square rounded-md overflow-hidden border bg-muted"
            >
              {uf.previewUrl && (
                <img
                  src={uf.previewUrl}
                  alt="Загрузка..."
                  className="w-full h-full object-cover opacity-50"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                {uf.error ? (
                  <div className="text-center p-1">
                    <AlertCircle className="w-5 h-5 text-red-500 mx-auto" />
                    <p className="text-xs text-red-500 mt-1 line-clamp-2">{uf.error}</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
                    <p className="text-xs mt-1">{uf.progress}%</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeUploadingFile(uf.file)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Counter */}
      <p className="text-xs text-muted-foreground text-right">
        {totalImages} из {maxFiles} фото
      </p>
    </div>
  );
}
