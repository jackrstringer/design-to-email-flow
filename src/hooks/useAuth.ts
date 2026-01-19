import { useAuthContext } from '@/contexts/AuthContext';

// Re-export the hook from context for backward compatibility
export function useAuth() {
  return useAuthContext();
}
