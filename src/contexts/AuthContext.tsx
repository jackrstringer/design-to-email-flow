import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session, AuthResponse, AuthTokenResponsePassword } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<AuthResponse>;
  signIn: (email: string, password: string) => Promise<AuthTokenResponsePassword>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileEnsured, setProfileEnsured] = useState<string | null>(null);

  useEffect(() => {
    // Helper to ensure profile exists for a user - only runs once per user
    const ensureProfile = async (u: User) => {
      if (profileEnsured === u.id) return; // Already ensured for this user
      
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: u.id, email: u.email }, { onConflict: 'id' });
      
      if (error) {
        console.error('Failed to ensure profile:', error);
      } else {
        setProfileEnsured(u.id);
      }
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        setSession(sess);
        setUser(sess?.user ?? null);
        setLoading(false);
        
        // Ensure profile exists when user signs in (only on these events)
        if (sess?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          setTimeout(() => ensureProfile(sess.user), 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      
      // Ensure profile exists for existing session
      if (sess?.user) {
        setTimeout(() => ensureProfile(sess.user), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [profileEnsured]);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return result;
  };

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return result;
  };

  const signOut = async () => {
    setProfileEnsured(null); // Reset on sign out
    const result = await supabase.auth.signOut();
    return result;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
