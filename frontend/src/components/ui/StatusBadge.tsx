import React from 'react';
import { 
  Clock, 
  Layers, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle 
} from 'lucide-react';
import { EmailStatus } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StatusBadgeProps {
  status: EmailStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const getStatusConfig = (status: EmailStatus) => {
    switch (status) {
      case 'SCHEDULED':
        return {
          icon: Clock,
          classes: 'bg-warning/10 text-warning border-warning/20',
          label: 'Scheduled'
        };
      case 'QUEUED':
        return {
          icon: Layers,
          classes: 'bg-info/10 text-info border-info/20',
          label: 'Queued'
        };
      case 'PROCESSING':
        return {
          icon: RefreshCw,
          classes: 'bg-accent/10 text-accent border-accent/20',
          iconClasses: 'animate-spin',
          label: 'Processing'
        };
      case 'SENT':
        return {
          icon: CheckCircle,
          classes: 'bg-success/10 text-success border-success/20',
          label: 'Sent'
        };
      case 'RATE_LIMITED':
        return {
          icon: AlertTriangle,
          classes: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
          label: 'Rate Limited'
        };
      case 'FAILED':
        return {
          icon: XCircle,
          classes: 'bg-error/10 text-error border-error/20',
          label: 'Failed'
        };
      case 'CANCELLED':
        return {
          icon: XCircle,
          classes: 'bg-text-tertiary/10 text-text-secondary border-text-tertiary/20',
          label: 'Cancelled'
        };
      default:
        return {
          icon: Clock,
          classes: 'bg-surface text-text-secondary border-border',
          label: status
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
      config.classes,
      className
    )}>
      <Icon className={cn("h-3.5 w-3.5", config.iconClasses)} />
      {config.label}
    </span>
  );
};
