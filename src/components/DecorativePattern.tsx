export const DecorativePattern = () => {
  // Generate random dots for the decorative pattern
  const dots = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    cx: Math.random() * 100,
    cy: Math.random() * 100,
    r: Math.random() * 2 + 1,
    opacity: Math.random() * 0.3 + 0.1,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        {dots.map((dot) => (
          <circle
            key={dot.id}
            cx={`${dot.cx}%`}
            cy={`${dot.cy}%`}
            r={dot.r}
            fill="white"
            opacity={dot.opacity}
          />
        ))}
      </svg>
      
      {/* Corner decorative elements */}
      <div className="absolute top-4 left-4 w-16 h-16 border border-primary-foreground/20 rounded-lg rotate-12" />
      <div className="absolute top-8 right-8 w-12 h-12 border border-primary-foreground/15 rounded-full" />
      <div className="absolute bottom-4 left-1/4 w-8 h-8 border border-primary-foreground/10 rounded" />
      <div className="absolute bottom-8 right-1/3 w-6 h-6 bg-primary-foreground/10 rounded-full" />
    </div>
  );
};
