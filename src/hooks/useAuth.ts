import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });

  useEffect(() => {
    // Helper to ensure profile exists for a user
    const ensureProfile = async (user: User) => {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
      if (error) {
        console.error('Failed to ensure profile:', error);
      }
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setAuthState({
          session,
          user: session?.user ?? null,
          loading: false,
        });
        
        // Ensure profile exists when user signs in
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          setTimeout(() => ensureProfile(session.user), 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setAuthState({
        session,
        user: session?.user ?? null,
        loading: false,
      });
      
      // Ensure profile exists for existing session
      if (session?.user) {
        setTimeout(() => ensureProfile(session.user), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user: authState.user,
    session: authState.session,
    loading: authState.loading,
    signUp,
    signIn,
    signOut,
  };
}
