import axios from "axios";
import JSZip from "jszip";
import { useAuthStore } from "../store/auth.store";
import { authAxios } from "./url.service";

const trainingBaseURL =
  process.env.REACT_APP_TRAINING_API_URL || "http://localhost:8002";

export const isTrainingServiceConfigured = () => Boolean(trainingBaseURL);

const trainingClient = axios.create({
  baseURL: trainingBaseURL,
  headers: { "Content-Type": "application/json" },
});

// Attach CloneOS auth token to all lora-train requests
trainingClient.interceptors.request.use(
  (config) => {
    const { token } = useAuthStore.getState();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * Reserve/deduct credits for starting a clone (CloneOS backend). Call this before startTraining.
 * Throws with response.status === 402 if insufficient credits.
 */
export const reserveCreditsForClone = async () => {
  const { data } = await authAxios.post("/clone/start");
  return data;
};

/**
 * Start LoRA training via POST /train.
 * @param {string} taskId      - Used as model_name on Replicate and as the S3 path prefix.
 * @param {string} emotion     - UI-only label (no longer sent as trigger_word).
 * @param {File[]} imageFiles  - Individual image files; zipped client-side into a single .zip.
 * @returns {Promise<{ training_id: string, status: string, model_url: string|null }>}
 */
export const startTraining = async (taskId, emotion, imageFiles) => {
  const zip = new JSZip();
  for (const file of imageFiles) {
    zip.file(file.name, file);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const zipFile = new File([zipBlob], `${taskId}-images.zip`, {
    type: "application/zip",
  });

  const formData = new FormData();
  formData.append("images", zipFile);
  formData.append("model_name", taskId);
  formData.append("steps", "1000");
  formData.append("visibility", "private");
  formData.append("clone", taskId);

  const { data } = await trainingClient.post("/train", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  // data shape: { training_id, status, model_url, weights_url, s3_url, s3_key, error }
  return data;
};

/**
 * Get the current user's single clone, or null if they have none.
 * @returns {Promise<{ model_name: string, s3_url: string|null, created_at: string|null }|null>}
 */
export const getMyClone = async () => {
  try {
    const { data } = await trainingClient.get("/me/clone");
    return data;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    // 401: re-throw so caller does not treat "unauthorized" as "no clone"
    throw err;
  }
};

/**
 * Poll training status using the Replicate training_id returned by startTraining.
 * Backend status values: starting | processing | succeeded | failed | canceled
 * @param {string} trainingId - The training_id from the startTraining response.
 * @returns {Promise<{ training_id: string, status: string, s3_url: string|null, error: string|null }>}
 */
export const getTrainingStatus = async (trainingId) => {
  const { data } = await trainingClient.get(`/status/${trainingId}`);
  return data;
};
