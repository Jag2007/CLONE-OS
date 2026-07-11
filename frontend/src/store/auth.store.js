import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      // Set user data
      setUser: (user) => set({ user }),

      // Set authentication data
      setAuth: (token, user) => {
        set({
          token,
          user,
          isAuthenticated: true
        });
      },

      // Clear authentication data
      clearAuth: () => set({
        token: null,
        user: null,
        isAuthenticated: false
      }),

      // Set loading state
      setLoading: (isLoading) => set({ isLoading }),

      // Update user credits
      updateCredits: (credits) => set((state) => ({
        user: state.user ? { ...state.user, creditsBalance: credits } : null
      })),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selectors for easy access
export const useUser = () => useAuthStore((state) => state.user);
export const useToken = () => useAuthStore((state) => state.token);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);

