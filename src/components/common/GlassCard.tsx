import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glow' | 'interactive' | 'accent';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'default',
  ...props
}) => {
  // Pure CSS Clean Light Theme Glass Card:
  // Crisp white, subtle slate borders, ultra smooth shadow, 60FPS performance on mobile.
  let variantStyles = 'bg-white border-slate-200 text-slate-900 shadow-sm';

  if (variant === 'glow') {
    variantStyles = 'bg-white border-cyan-300 text-slate-900 shadow-[0_4px_16px_rgba(6,182,212,0.12)] ring-1 ring-cyan-200';
  } else if (variant === 'interactive') {
    variantStyles = 'bg-white border-slate-200 hover:border-cyan-400 hover:shadow-md active:scale-[0.99] transition-all duration-150 cursor-pointer text-slate-900';
  } else if (variant === 'accent') {
    variantStyles = 'bg-gradient-to-br from-white via-cyan-50/30 to-blue-50/30 border-cyan-200/80 shadow-sm text-slate-900';
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
