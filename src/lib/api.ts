import { supabase } from "./supabase";

const API_BASE_URL = "https://qz8jc4apa3.execute-api.us-east-1.amazonaws.com/prod";

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
  timeoutMs?: number;
};

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  let res: Response;
  try {
    console.info(`[api] ${options.method ?? "GET"} ${path}`);
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.", 0);
    }
    throw new ApiError("Network error. Please check your connection and try again.", 0);
  }
  clearTimeout(timer);

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
  s3Key: string;
}

export interface ProcessResponse {
  extraction?: unknown;
  interpretation?: string;
  documentId?: string;
}

export interface Insight {
  biomarker: string;
  message: string;
  severity?: string;
  direction?: string;
  value?: string | number;
  unit?: string;
  reference_range?: string;
  created_at?: string;
}

export interface ScoreResponse {
  score: number;
  summary?: string;
  factors?: { label: string; impact?: string; detail?: string }[];
}

export interface Profile {
  age?: number | null;
  sex?: string | null;
  chronic_conditions?: string | null;
  current_medications?: string | null;
  allergies?: string | null;
  lifestyle_notes?: string | null;
}

/* ---------------- API methods ---------------- */

export const apiClient = {
  /* Documents */
  listDocuments: () => api<MedicalDocument[]>("/documents"),

  getDocument: (id: string) => api<DocumentDetail>(`/documents/${id}`),

  deleteDocument: (id: string) =>
    api<void>(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /* Upload + processing */
  presign: (payload: { filename: string; contentType: string }) =>
    api<PresignResponse>("/presign", { method: "POST", body: payload }),

  process: (payload: { documentId: string; s3Key: string }) =>
    api<ProcessResponse>("/process", { method: "POST", body: payload, timeoutMs: 120_000 }),

  /* Insights */
  getInsights: () => api<Insight[]>("/insights"),

  dismissInsight: (payload: { biomarker: string; message: string }) =>
    api<void>("/insights/dismiss", { method: "POST", body: payload }),

  /* Health score */
  getScore: () => api<ScoreResponse>("/score"),

  /* Profile */
  getProfile: () => api<Profile>("/profile"),

  saveProfile: (payload: Profile) =>
    api<Profile>("/profile", { method: "PUT", body: payload }),

  /* Trends (existing helper used by the Trends page) */
  getTrend: (biomarker: string) =>
    api<TrendResponse>(`/trend?biomarker=${encodeURIComponent(biomarker)}`),

  /* Account */
  deleteAccount: () => api<void>("/account", { method: "DELETE" }),
};

/**
 * Upload a file directly to a pre-signed S3 URL (no auth header).
 * Uses XMLHttpRequest for real progress, an explicit timeout, and clearer
 * error messages — a hang here almost always means the S3 bucket is missing
 * a CORS rule that allows browser PUTs from this app's origin.
 */
export function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.timeout = 60_000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      console.info(`[upload] S3 PUT responded ${xhr.status}`);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else if (xhr.status === 403) {
        reject(
          new ApiError(
            "Storage rejected the upload (403). The S3 bucket's permissions or CORS policy need to allow uploads from this site.",
            403,
          ),
        );
      } else {
        reject(new ApiError(`The file could not be uploaded (${xhr.status}).`, xhr.status));
      }
    };

    xhr.ontimeout = () => {
      console.error("[upload] S3 PUT timed out after 60s");
      reject(new ApiError("The upload timed out. Please check your connection and try again.", 0));
    };

    xhr.onerror = () => {
      // A status of 0 with no response is the classic signature of a blocked
      // CORS preflight — the browser never lets the response through.
      console.error("[upload] S3 PUT failed (likely CORS/network)", xhr.status);
      reject(
        new ApiError(
          "Couldn't reach storage. This is usually a CORS configuration issue on the S3 bucket — it must allow PUT requests from this site's origin.",
          0,
        ),
      );
    };

    xhr.send(file);
  });
}

