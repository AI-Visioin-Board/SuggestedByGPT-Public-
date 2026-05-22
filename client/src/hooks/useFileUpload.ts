/**
 * useFileUpload — Encapsulates file upload state, validation, and mutations.
 * Extracted from ClientPortal.tsx for reuse in V2.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export type FileCategory = "logo" | "content" | "credentials" | "reference" | "other";

interface UseFileUploadOptions {
  refetchFiles: () => void;
  orderId?: number;
}

export function useFileUpload({ refetchFiles, orderId }: UseFileUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<FileCategory>("other");
  const [uploadNotes, setUploadNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFileMutation = trpc.clientPortal.uploadFile.useMutation({
    onSuccess: () => {
      setIsUploading(false);
      setUploadNotes("");
      setUploadCategory("other");
      refetchFiles();
      toast.success("File uploaded successfully!");
    },
    onError: (error: any) => {
      setIsUploading(false);
      toast.error(error.message || "Failed to upload file");
    },
  });

  const deleteFileMutation = trpc.clientPortal.deleteFile.useMutation({
    onSuccess: () => {
      refetchFiles();
      toast.success("File deleted.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE) {
      toast.error("File size must be under 10MB");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("File type not supported. Please upload images, PDFs, Word docs, Excel files, or text files.");
      return;
    }

    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadFileMutation.mutate({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        fileData: base64,
        category: uploadCategory,
        notes: uploadNotes || undefined,
        orderId,
      });
    };
    reader.onerror = () => {
      setIsUploading(false);
      toast.error("Failed to read file");
    };
    reader.readAsDataURL(file);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (fileId: number) => {
    if (confirm("Delete this file?")) {
      deleteFileMutation.mutate({ fileId });
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  return {
    isUploading,
    uploadCategory,
    setUploadCategory,
    uploadNotes,
    setUploadNotes,
    fileInputRef,
    handleFileUpload,
    handleDelete,
    triggerFileInput,
  };
}

/** Get file icon type based on MIME type */
export function getFileIconType(mimeType: string): "image" | "pdf" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "other";
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
