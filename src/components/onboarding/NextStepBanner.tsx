import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import type { OnboardingStep } from '@/hooks/useOnboardingStatus';

const STORAGE_KEY = 'onboarding.bannerDismissed';

interface NextStepBannerProps {
  step: OnboardingStep;
}

/**
 * Slim inline banner pointing at the single next setup step.
 * Dismissal is stored per step key, so the banner re-appears
 * once the user moves on to the next step.
 */
export function NextStepBanner({ step }: NextStepBannerProps) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );

  if (dismissedKey === step.key) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, step.key);
    setDismissedKey(step.key);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
      <p className="flex-1 min-w-0 truncate">
        <span className="text-muted-foreground">Next:</span>{' '}
        <span className="font-medium">{step.title}</span>
      </p>
      <Link
        to={step.href}
        className="flex shrink-0 items-center gap-1 font-medium text-brand hover:underline"
      >
        Continue
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
