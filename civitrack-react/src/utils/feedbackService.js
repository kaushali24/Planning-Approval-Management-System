import { API_BASE_URL } from './apiBase';

export const fetchFeedbackSummary = async (token) => {
  if (!token) {
    return { unreadCount: 0 };
  }

  const response = await fetch(`${API_BASE_URL}/api/feedback/summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || 'Failed to load feedback summary');
  }

  return {
    unreadCount: Number(payload?.summary?.unreadCount || 0),
  };
};
