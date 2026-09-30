import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, loading = false, icon, children, disabled, ...props }, ref) => {
    const _loading = isLoading || loading;
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:pointer-events-none";
    
    const variants = {
      primary: "bg-accent text-white hover:bg-accent-hover focus:ring-accent",
      secondary: "bg-surface hover:bg-surface-hover text-text-primary border border-border focus:ring-border-hover",
      outline: "border border-border text-text-primary hover:bg-surface focus:ring-border",
      danger: "bg-error text-white hover:bg-red-600 focus:ring-error",
      ghost: "text-text-secondary hover:text-text-primary hover:bg-surface focus:ring-surface"
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base"
    };

    return (
      <button
        ref={ref}
        disabled={disabled || _loading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {_loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!_loading && icon && <span className="mr-2 inline-flex">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
