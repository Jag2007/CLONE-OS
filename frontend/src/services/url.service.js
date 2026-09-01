import axios from "axios";
import { useAuthStore } from "../store/auth.store";

const configuredBaseUrl = (process.env.REACT_APP_BASE_URL || "").trim();
const isBrowser = typeof window !== "undefined";
const isLocalFrontend =
  isBrowser && ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const base_url = (
  configuredBaseUrl ||
  (isLocalFrontend
    ? "http://localhost:3001"
    : isBrowser
      ? `${window.location.origin}/api`
      : "http://localhost:3001")
).replace(/\/$/, "");

const headers = {
  "Content-Type": "application/json",
};

// Helper function to recursively fix URLs in the response payload
function fixUrls(data) {
  if (!data || typeof data !== "object") return data;

  const backendDomain = base_url;

  const cleanUrl = (url) => {
    if (!url || typeof url !== "string") return url;

    // Check if it has a localhost URL
    if (window.location.hostname !== "localhost" && url.includes("localhost:")) {
      return url.replace(/https?:\/\/localhost:\d+/, backendDomain);
    }
    // If it's a relative path starting with /uploads
    if (url.startsWith("/uploads/")) {
      return `${backendDomain}${url}`;
    }
    // If it's a relative path starting with uploads/
    if (url.startsWith("uploads/")) {
      return `${backendDomain}/${url}`;
    }
    return url;
  };

  if (Array.isArray(data)) {
    return data.map(item => fixUrls(item));
  }

  // Common URL keys used across pages/storyboards
  const keysToClean = [
    "sketchUrl",
    "finalImageUrl",
    "storageUrl",
    "resultUrl",
    "inputImageUrl",
    "avatarUrl",
    "imageUrl",
    "videoUrl",
  ];
  
  // Clone to avoid modifying read-only state properties directly if they are frozen
  const cleaned = {};
  for (const key of Object.keys(data)) {
    if (keysToClean.includes(key)) {
      cleaned[key] = cleanUrl(data[key]);
    } else if (typeof data[key] === "object" && data[key] !== null) {
      cleaned[key] = fixUrls(data[key]);
    } else {
      cleaned[key] = data[key];
    }
  }

  return cleaned;
}

export const axiosInstance = axios.create({
  baseURL: base_url,
  headers,
});

const enrichApiError = (error) => {
  const requestUrl = error.config?.url || "";
  const status = error.response?.status;
  const requestOrigin = (() => {
    try {
      return new URL(requestUrl, error.config?.baseURL || window.location.origin).origin;
    } catch {
      return "";
    }
  })();

  if (
    status === 404 &&
    isBrowser &&
    requestOrigin === window.location.origin &&
    requestUrl !== "/health"
  ) {
    error.message =
      "API route not found on this domain. Set REACT_APP_BASE_URL to the deployed backend URL, or deploy the backend behind /api on the same domain.";
  }

  return error;
};

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = fixUrls(response.data);
    }
    return response;
  },
  (error) => Promise.reject(enrichApiError(error))
);

export const authAxios = axios.create({
  baseURL: base_url,
  headers,
});

authAxios.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = fixUrls(response.data);
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const apiError = error.response?.data?.error;
    const isAuthFailure =
      status === 401 || (status === 403 && apiError === "Invalid or expired token");

    if (isAuthFailure) {
      useAuthStore.getState().clearAuth();
      window.location.href = "/login";
    }
    return Promise.reject(enrichApiError(error));
  },
);

authAxios.interceptors.request.use(
  (config) => {
    // Try to get token from Zustand store first
    const { token } = useAuthStore.getState();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Helper functions for token management
export const setAuthToken = (token) => {
  useAuthStore.getState().setAuth(token, useAuthStore.getState().user);
};

export const removeAuthToken = () => {
  useAuthStore.getState().clearAuth();
};
