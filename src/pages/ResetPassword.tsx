import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Whether Supabase has established a recovery session from the email link.
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    // First, check if there's already a recovery/active session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setRecoveryReady(true);
        setSessionChecked(true);
      }
    });

    // Also listen for the PASSWORD_RECOVERY event that fires when the user
    // arrives from the email link (Supabase processes the token in the URL hash).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryReady(true);
        setSessionChecked(true);
      }
    });

    // After a short grace period, if nothing has fired, mark as checked (no session).
    const timer = setTimeout(() => {
      setSessionChecked(true);
    }, 1500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await updatePassword(newPassword);
    setIsSubmitting(false);

    if (error) {
      setError(error.message);
    } else {
      toast.success('Password updated. You are now signed in.');
      navigate('/queue');
    }
  };

  // Still checking — show spinner.
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="glow-ember relative flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px] animate-scale-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(26_94%_55%)] to-[hsl(20_92%_46%)] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25),0_2px_8px_hsl(20_92%_30%/0.3),0_8px_24px_-8px_hsl(20_92%_40%/0.5)]"
            aria-hidden="true"
          >
            <Send className="h-5 w-5 text-white" strokeWidth={2.25} />
          </span>
          <h1 className="font-display text-[32px] leading-tight text-foreground">
            {recoveryReady ? 'Set new password' : 'Link expired'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {recoveryReady
              ? 'Choose a strong password for your account.'
              : 'This reset link is invalid or has expired.'}
          </p>
        </div>

        <Card className="rounded-2xl border-border/70 shadow-floating">
          <CardContent className="p-6">
            {recoveryReady ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Reset links expire after 1 hour and can only be used once. Request a new one from the sign-in page.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/auth')}
                >
                  Back to sign in
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-7 text-center text-xs text-muted-foreground/80">
          Figma → sliced, QA'd, linked → Klaviyo. In one click.
        </p>
      </div>
    </div>
  );
}
