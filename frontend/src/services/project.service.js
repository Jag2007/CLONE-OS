import { authAxios } from './url.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const prefix = '/projects';

/** Authenticated blob download for a scene sketch (avoids S3 CORS in the browser). */
export async function downloadSceneSketchBlob(sceneId) {
  const res = await authAxios.get(
    `${prefix}/scenes/${sceneId}/sketch-download`,
    { responseType: 'blob' },
  );
  return res.data;
}

// Low-level API
export const projectApi = () => {
  // Create a new project
  const createProject = async (payload) => 
    authAxios.post(`${prefix}`, payload);

  // Get all projects for the current user
  const getAllProjects = async () => 
    authAxios.get(`${prefix}`);

  // Get a specific project by ID
  const getProjectById = async (id) => 
    authAxios.get(`${prefix}/${id}`);

  // Generate script and storyboard scenes
  const generateScript = async (projectId, prompt) => 
    authAxios.post(`${prefix}/${projectId}/script`, { prompt });

  // Generate sketches for scenes
  const generateSketches = async (projectId) => 
    authAxios.post(`${prefix}/${projectId}/sketches`);

  // Generate final photorealistic images
  const generateImages = async (projectId, force = false) =>
    authAxios.post(`${prefix}/${projectId}/images${force ? '?force=true' : ''}`);

  // Regenerate a specific scene
  const regenerateScene = async (sceneId, prompt) =>
    authAxios.post(`${prefix}/scenes/${sceneId}/regenerate`, { prompt });

  // Render final video
  const renderVideo = async (projectId, actorId) =>
    authAxios.post(`${prefix}/${projectId}/render`, { actorId });

  // Upload user-provided storyboard sketches (multipart, field name: sketches)
  const uploadStoryboard = async (projectId, files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('sketches', file));
    return authAxios.post(`${prefix}/${projectId}/storyboard`, formData, {
      transformRequest: [
        (data, headers) => {
          delete headers['Content-Type'];
          return data;
        },
      ],
    });
  };

  /** Per-scene sketch upload (multipart, field name: sketch) */
  const uploadSceneSketch = async (sceneId, file) => {
    const formData = new FormData();
    formData.append('sketch', file);
    return authAxios.post(`${prefix}/scenes/${sceneId}/sketch`, formData, {
      transformRequest: [
        (data, headers) => {
          delete headers['Content-Type'];
          return data;
        },
      ],
    });
  };

  const submitSceneFeedback = async (sceneId, body) =>
    authAxios.post(`${prefix}/scenes/${sceneId}/feedback`, body);

  const getProjectFeedback = async (projectId) =>
    authAxios.get(`${prefix}/${projectId}/feedback`);

  return {
    createProject,
    getAllProjects,
    getProjectById,
    generateScript,
    generateSketches,
    generateImages,
    regenerateScene,
    renderVideo,
    uploadStoryboard,
    uploadSceneSketch,
    submitSceneFeedback,
    getProjectFeedback,
  };
};

// React Query Hooks

/**
 * Get all projects for the current user
 */
export function useGetAllProjects(options = {}) {
  const { getAllProjects } = projectApi();
  return useQuery({
    queryKey: ['projects', 'list'],
    queryFn: () => getAllProjects().then(res => res.data?.data ?? res.data),
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
}

/**
 * Get a specific project by ID
 */
export function useGetProjectById(projectId, options = {}) {
  const { getProjectById } = projectApi();
  return useQuery({
    queryKey: ['projects', projectId],
    enabled: !!projectId,
    queryFn: () => getProjectById(projectId).then(res => res.data?.data ?? res.data),
    staleTime: 0, // Always fetch fresh data on mount/refresh
    ...options,
  });
}

/**
 * Create a new project
 */
export function useCreateProject(options = {}) {
  const { createProject } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => createProject(payload).then(res => res.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'list'] });
      if (data?.data?.id) {
        queryClient.setQueryData(['projects', data.data.id], data.data);
      }
    },
    ...options,
  });
}

/**
 * Generate script and storyboard scenes for a project
 */
export function useGenerateScript(options = {}) {
  const { generateScript } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, prompt }) => 
      generateScript(projectId, prompt).then(res => res.data),
    onSuccess: (data, variables) => {
      // Invalidate the project to get updated scenes
      queryClient.invalidateQueries({ 
        queryKey: ['projects', variables.projectId] 
      });
    },
    ...options,
  });
}

/**
 * Generate sketches for all scenes in a project
 */
export function useGenerateSketches(options = {}) {
  const { generateSketches } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId) => 
      generateSketches(projectId).then(res => res.data),
    onSuccess: (data, projectId) => {
      // Invalidate the project to get updated scenes with sketches
      queryClient.invalidateQueries({ 
        queryKey: ['projects', projectId] 
      });
    },
    ...options,
  });
}

/**
 * Generate final photorealistic images for all scenes
 */
export function useGenerateImages(options = {}) {
  const { generateImages } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, force = false }) =>
      generateImages(projectId, force).then(res => res.data),
    onSuccess: (data, projectId) => {
      // Invalidate the project to get updated scenes with final images
      queryClient.invalidateQueries({ 
        queryKey: ['projects', projectId] 
      });
    },
    ...options,
  });
}

/**
 * Regenerate image for a specific scene
 */
export function useRegenerateScene(options = {}) {
  const { regenerateScene } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sceneId, prompt }) => 
      regenerateScene(sceneId, prompt).then(res => res.data),
    onSuccess: (data) => {
      // Invalidate all projects to refresh the scene data
      queryClient.invalidateQueries({ 
        queryKey: ['projects'] 
      });
    },
    ...options,
  });
}

/**
 * Render final video for a project
 */
export function useRenderVideo(options = {}) {
  const { renderVideo } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, actorId }) => 
      renderVideo(projectId, actorId).then(res => res.data),
    onSuccess: (data, variables) => {
      // Invalidate the project to get updated status
      queryClient.invalidateQueries({ 
        queryKey: ['projects', variables.projectId] 
      });
    },
    ...options,
  });
}

/**
 * Upload custom storyboard images (one per scene, in order)
 */
export function useUploadStoryboard(options = {}) {
  const { uploadStoryboard } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, files }) =>
      uploadStoryboard(projectId, files).then((res) => res.data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.projectId],
      });
    },
    ...options,
  });
}

/**
 * Upload a sketch for a single scene (POST /projects/scenes/:sceneId/sketch)
 */
export function useUploadSceneSketch(options = {}) {
  const { uploadSceneSketch } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sceneId, projectId, file }) =>
      uploadSceneSketch(sceneId, file).then(
        (res) => res.data?.data ?? res.data,
      ),
    onSuccess: (data, variables) => {
      if (variables.projectId) {
        queryClient.invalidateQueries({
          queryKey: ['projects', variables.projectId],
        });
      }
    },
    ...options,
  });
}

/**
 * Submit or update feedback for a scene's sketch or final image
 */
export function useSubmitSceneFeedback(options = {}) {
  const { submitSceneFeedback } = projectApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sceneId, projectId, imageType, rating, comment }) =>
      submitSceneFeedback(sceneId, {
        imageType,
        rating,
        ...(comment != null && comment !== '' ? { comment } : {}),
      }).then((res) => res.data),
    onSuccess: (data, variables) => {
      if (variables.projectId) {
        queryClient.invalidateQueries({
          queryKey: ['projects', variables.projectId, 'feedback'],
        });
      }
    },
    ...options,
  });
}

/**
 * List all feedback for a project (scenes joined)
 */
export function useGetProjectFeedback(projectId, options = {}) {
  const { getProjectFeedback } = projectApi();
  return useQuery({
    queryKey: ['projects', projectId, 'feedback'],
    enabled: !!projectId,
    queryFn: () =>
      getProjectFeedback(projectId).then(
        (res) => res.data?.data ?? res.data
      ),
    staleTime: 1000 * 60,
    ...options,
  });
}
