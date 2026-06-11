import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist or may have moved.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-6">
          <Link to="/queue">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to queue
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
