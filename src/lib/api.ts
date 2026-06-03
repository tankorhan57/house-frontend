import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/auth") {
    window.location.href = "/auth";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError("Network error. Please check your connection and try again.", 0);
  }

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.message || data?.error) message = data.message || data.error;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}

/* ---------------- Types ---------------- */

export type Urgency = "urgent" | "soon" | "routine" | string;

export interface MedicalDocument {
  documentId: string;
  document_type?: string;
  date_of_service?: string;
  provider_name?: string;
  urgency?: Urgency;
  follow_up_recommended?: boolean;
  fileName?: string;
  created_at?: string;
}

export interface AbnormalValue {
  name: string;
  value: string | number;
  unit?: string;
  reference_range?: string;
  direction?: string;
}

export interface DocumentDetail extends MedicalDocument {
  interpretation?: string;
  key_findings?: string[];
  abnormal_values?: AbnormalValue[];
}

export interface TrendPoint {
  date: string;
  value: number;
  unit?: string;
  reference_range?: string;
}

export interface TrendResponse {
  biomarker: string;
  unit?: string;
  points: TrendPoint[];
}

export interface PresignResponse {
  uploadUrl: string;
  documentId: string;
  key: string;
}

export interface ProcessResponse {
  extraction?: unknown;
  interpretation?: string;
  documentId?: string;
}

/* ---------------- API methods ---------------- */

export const apiClient = {
  listDocuments: () => api<MedicalDocument[]>("/documents"),

  getDocument: (id: string) => api<DocumentDetail>(`/documents/${id}`),

  presign: (payload: { fileName: string; fileType: string; fileSize: number }) =>
    api<PresignResponse>("/presign", { method: "POST", body: payload }),

  process: (payload: { documentId: string; key: string; fileName: string }) =>
    api<ProcessResponse>("/process", { method: "POST", body: payload }),

  getTrend: (biomarker: string) =>
    api<TrendResponse>(`/trend?biomarker=${encodeURIComponent(biomarker)}`),

  deleteAccount: () => api<void>("/account", { method: "DELETE" }),
};

/** Upload a file directly to a pre-signed S3 URL (no auth header). */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new ApiError("Failed to upload the file. Please try again.", 0);
  }
  if (!res.ok) {
    throw new ApiError("The file could not be uploaded. Please try again.", res.status);
  }
}
