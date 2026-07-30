import axios from "axios";
import { useAuthStore } from "../store/auth.store";

export const base_url = (process.env.REACT_APP_BASE_URL || "http://localhost:3001").replace(/\/$/, "");

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
    return url;
  };

  if (Array.isArray(data)) {
    return data.map(item => fixUrls(item));
  }

  // Common URL keys used across pages/storyboards
  const keysToClean = ["sketchUrl", "finalImageUrl", "storageUrl", "avatarUrl", "imageUrl"];
  
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

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = fixUrls(response.data);
    }
    return response;
  },
  (error) => Promise.reject(error)
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
    return Promise.reject(error);
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
