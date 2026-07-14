import React from 'react';
import { cn } from '../lib/utils';

interface TacticalPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function TacticalPanel({ children, className, ...props }: TacticalPanelProps) {
  return (
    <div 
      className={cn(
        "relative bg-suncoast-charcoal tactical-border tactical-shadow rounded-none",
        className
      )}
      {...props}
    >
      <div className="absolute w-[5px] h-[5px] bg-suncoast-gold/95 -top-[2px] -left-[2px]" />
      <div className="absolute w-[5px] h-[5px] bg-suncoast-gold/95 -top-[2px] -right-[2px]" />
      <div className="absolute w-[5px] h-[5px] bg-suncoast-gold/95 -bottom-[2px] -left-[2px]" />
      <div className="absolute w-[5px] h-[5px] bg-suncoast-gold/95 -bottom-[2px] -right-[2px]" />
      {children}
    </div>
  );
}
