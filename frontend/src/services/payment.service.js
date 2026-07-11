import { authAxios } from './url.service';
import { useAuthStore } from '../store/auth.store';

const PAYMENTS_PREFIX = '/payments';
const AUTH_PROFILE_PREFIX = '/auth';
const USERS_PREFIX = '/users';

/**
 * Create a Razorpay order for buying credits.
 * @param {number} amount - Amount in rupees
 * @returns {Promise<{ order: { id: string, amount: number, currency: string } }>}
 */
export async function createOrder(amount) {
  const res = await authAxios.post(`${PAYMENTS_PREFIX}/buy-credits`, { amount });
  const data = res.data;
  const order = data?.order;
  if (!order) throw new Error(data?.message || 'Failed to create order');
  return { order };
}

/**
 * Refetch user profile and update auth store (including creditsBalance).
 * Use after successful payment so the header badge and persisted user stay in sync.
 */
export async function refetchProfileAndUpdateStore() {
  const res = await authAxios.get(`${AUTH_PROFILE_PREFIX}/profile`);
  const data = res.data?.data ?? res.data;
  if (data?.creditsBalance !== undefined) {
    useAuthStore.getState().updateCredits(data.creditsBalance);
  }
  if (data) {
    const current = useAuthStore.getState().user;
    useAuthStore.getState().setUser({ ...current, ...data });
  }
  return data;
}

/**
 * Get current user's credits from backend (optional; profile refetch also returns credits).
 */
export async function getCredits() {
  const res = await authAxios.get(`${USERS_PREFIX}/credits`);
  const data = res.data?.data ?? res.data;
  return data?.credits ?? data;
}
