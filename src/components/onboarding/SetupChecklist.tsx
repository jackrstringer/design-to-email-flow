import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { Skeleton } from '@/components/ui/skeleton';

export function SetupChecklist() {
  const { data: status, isLoading } = useOnboardingStatus();

  if (isLoading || !status) {
    return (
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-6 w-6 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const nextKey = status.nextStep?.key ?? null;

  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-xl font-semibold tracking-tight">Get set up</CardTitle>
          <CardDescription className="mt-1">
            A few steps and your designs go from Figma to Klaviyo in one click.
          </CardDescription>
        </div>
        <div className="space-y-1.5">
          <Progress value={(status.completeCount / status.totalRequired) * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {status.completeCount} of {status.totalRequired} complete
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {status.steps.map((step, index) => {
            const isNext = step.key === nextKey;
            return (
              <li
                key={step.key}
                className={`flex items-start gap-3 rounded-lg p-3 ${
                  isNext ? 'bg-muted/50' : ''
                } ${!step.complete && !isNext ? 'opacity-60' : ''}`}
              >
                {step.complete ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                      isNext ? 'border-primary text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </span>
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p
                    className={`text-sm font-medium ${
                      step.complete ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  {isNext && (
                    <Button asChild size="sm" className="mt-2.5">
                      <Link to={step.href}>
                        Continue
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
