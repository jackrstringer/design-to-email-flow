import { DecorativePattern } from './DecorativePattern';

interface HeroSectionProps {
  title: string;
  subtitle?: string;
}

export const HeroSection = ({ title, subtitle }: HeroSectionProps) => {
  return (
    <div className="relative hero-gradient overflow-hidden">
      <DecorativePattern />
      <div className="relative z-10 py-16 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-primary-foreground/80 text-lg">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
