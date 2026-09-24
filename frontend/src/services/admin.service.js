import { authAxios } from './url.service';

const ADMIN_PREFIX = '/admin';

export async function fetchAdminUsers() {
  const res = await authAxios.get(`${ADMIN_PREFIX}/users`);
  return res.data;
}

export async function fetchAdminStats() {
  const res = await authAxios.get(`${ADMIN_PREFIX}/stats`);
  return res.data;
}

export async function updateAdminUserCredits(userId, amount, mode = 'add') {
  const res = await authAxios.post(`${ADMIN_PREFIX}/users/${userId}/credits`, { amount, mode });
  return res.data;
}

export async function updateAdminUserPlan(userId, plan) {
  const res = await authAxios.patch(`${ADMIN_PREFIX}/users/${userId}/plan`, { plan });
  return res.data;
}

export async function updateAdminUserRole(userId, role) {
  const res = await authAxios.patch(`${ADMIN_PREFIX}/users/${userId}/role`, { role });
  return res.data;
}
