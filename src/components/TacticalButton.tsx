import React from 'react';
import { cn } from '../lib/utils';

interface TacticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function TacticalButton({ children, className, variant = 'primary', type = 'button', ...props }: TacticalButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "font-mono text-xs uppercase tracking-widest rounded-none border transition-colors flex items-center justify-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variant === 'primary' && "border-suncoast-gold text-suncoast-gold hover:bg-suncoast-gold/20",
        variant === 'secondary' && "border-white/20 text-suncoast-cream hover:border-suncoast-gold/50 hover:text-suncoast-gold hover:bg-suncoast-gold/10",
        variant === 'danger' && "border-red-500/50 text-red-400 hover:border-red-500 hover:bg-red-500/10",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
