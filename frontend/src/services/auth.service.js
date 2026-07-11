import { axiosInstance, authAxios, removeAuthToken } from './url.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const prefix = '/auth';

// Low-level API
export const authApi = () => {
  const login = async (credentials) => axiosInstance.post(`${prefix}/login`, credentials);
  const register = async (userData) => axiosInstance.post(`${prefix}/signup`, userData);
  const profile = async () => authAxios.get(`${prefix}/profile`);
  return { login, register, profile };
};

// Compatibility export for Dashboard.jsx
export const logout = () => {
  removeAuthToken();
  window.location.href = '/login';
};

// React Query hooks
export function useProfile(options = {}) {
  const { profile } = authApi();
  return useQuery({
    queryKey: ['auth', 'profile'],
    enabled: false,
    queryFn: () => profile().then(res => res.data?.data ?? res.data),
    ...options,
  });
}

export function useLogin(options = {}) {
  const { login } = authApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials) => login(credentials).then(res => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
      await queryClient.refetchQueries({ queryKey: ['auth', 'profile'] });
    },
    ...options,
  });
}

export function useRegister(options = {}) {
  const { register } = authApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userData) => register(userData).then(res => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
      await queryClient.refetchQueries({ queryKey: ['auth', 'profile'] });
    },
    ...options,
  });
}
