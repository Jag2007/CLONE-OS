import { authAxios } from './url.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const prefix = '/generation-lab';

export const generationLabApi = () => {
  const listJobs = async () => authAxios.get(prefix);
  const getJob = async (id) => authAxios.get(`${prefix}/${id}`);
  const createJob = async (payload) => authAxios.post(prefix, payload);
  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return authAxios.post(`${prefix}/upload`, formData, {
      transformRequest: [
        (data, headers) => {
          delete headers['Content-Type'];
          return data;
        },
      ],
    });
  };

  return { listJobs, getJob, createJob, uploadImage };
};

export function useGenerationLabJobs(options = {}) {
  const { listJobs } = generationLabApi();
  return useQuery({
    queryKey: ['generation-lab', 'jobs'],
    queryFn: () => listJobs().then((res) => res.data?.data ?? res.data),
    refetchInterval: (query) => {
      const jobs = query.state.data || [];
      return jobs.some((job) => ['PENDING', 'RUNNING'].includes(job.status))
        ? 8000
        : false;
    },
    ...options,
  });
}

export function useGenerationLabJob(id, options = {}) {
  const { getJob } = generationLabApi();
  return useQuery({
    queryKey: ['generation-lab', 'jobs', id],
    enabled: Boolean(id),
    queryFn: () => getJob(id).then((res) => res.data?.data ?? res.data),
    refetchInterval: (query) => {
      const job = query.state.data;
      return job && ['PENDING', 'RUNNING'].includes(job.status) ? 8000 : false;
    },
    ...options,
  });
}

export function useCreateGenerationLabJob(options = {}) {
  const { createJob } = generationLabApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createJob(payload).then((res) => res.data?.data ?? res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation-lab', 'jobs'] });
    },
    ...options,
  });
}

export function useUploadGenerationLabImage(options = {}) {
  const { uploadImage } = generationLabApi();
  return useMutation({
    mutationFn: (file) => uploadImage(file).then((res) => res.data?.data ?? res.data),
    ...options,
  });
}
