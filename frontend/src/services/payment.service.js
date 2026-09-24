import { authAxios } from './url.service';
import { useAuthStore } from '../store/auth.store';

const PAYMENTS_PREFIX = '/payments';
const AUTH_PROFILE_PREFIX = '/auth';
const USERS_PREFIX = '/users';

/**
 * Create a Razorpay order for buying credits or pro plan.
 * @param {number} amount - Amount in rupees
 * @param {string} [purchaseType='credits'] - 'credits' | 'pro'
 * @returns {Promise<{ order: { id: string, amount: number, currency: string }, isMock?: boolean }>}
 */
export async function createOrder(amount, purchaseType = 'credits') {
  const res = await authAxios.post(`${PAYMENTS_PREFIX}/buy-credits`, { amount, purchaseType });
  const data = res.data;
  const order = data?.order;
  if (!order) throw new Error(data?.message || 'Failed to create order');
  return { order, isMock: data.isMock };
}

/**
 * Verify Razorpay payment and update account status in DB immediately.
 */
export async function verifyPaymentPayload(payload) {
  const res = await authAxios.post(`${PAYMENTS_PREFIX}/verify`, payload);
  const data = res.data;
  if (data?.user) {
    const current = useAuthStore.getState().user;
    useAuthStore.getState().setUser({ ...current, ...data.user });
  }
  return data;
}

/**
 * Refetch user profile and update auth store (including creditsBalance, plan, role).
 * Use after successful payment so the header badge and persisted user stay in sync.
 */
export async function refetchProfileAndUpdateStore() {
  const res = await authAxios.get(`${AUTH_PROFILE_PREFIX}/profile`);
  const data = res.data?.data ?? res.data;
  if (data) {
    const current = useAuthStore.getState().user;
    useAuthStore.getState().setUser({ ...current, ...data });
  }
  return data;
}

/**
 * Get current user's credits from backend.
 */
export async function getCredits() {
  const res = await authAxios.get(`${USERS_PREFIX}/credits`);
  const data = res.data?.data ?? res.data;
  return data?.credits ?? data;
}
