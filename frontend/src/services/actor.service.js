import { axiosInstance, authAxios } from './url.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const prefix = '/actors';

// Low-level API
export const actorApi = () => {
  const getAllActors = async () => axiosInstance.get(`${prefix}`);
  const getActorById = async (id) => axiosInstance.get(`${prefix}/${id}`);
  
  return { getAllActors, getActorById };
};

// React Query hooks
export function useGetAllActors(options = {}) {
  const { getAllActors } = actorApi();
  return useQuery({
    queryKey: ['actors', 'list'],
    queryFn: () => getAllActors().then((res) => res.data?.data ?? res.data),
    ...options,
  });
}

export function useGetActorById(id, options = {}) {
  const { getActorById } = actorApi();
  return useQuery({
    queryKey: ['actors', id],
    enabled: !!id,
    queryFn: () => getActorById(id).then(res => res.data?.data ?? res.data),
    ...options,
  });
}
