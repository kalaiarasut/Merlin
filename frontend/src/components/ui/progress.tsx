import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  variant?: 'default' | 'success' | 'warning' | 'gradient'
  size?: 'sm' | 'default' | 'lg'
  showValue?: boolean
  animated?: boolean
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, variant = 'default', size = 'default', showValue, animated, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
    
    const variants = {
      default: 'bg-gradient-to-r from-ocean-400 to-ocean-600',
      success: 'bg-gradient-to-r from-marine-400 to-marine-600',
      warning: 'bg-gradient-to-r from-coral-400 to-coral-600',
      gradient: 'bg-gradient-to-r from-ocean-400 via-marine-400 to-ocean-600',
    }
    
    const sizes = {
      sm: 'h-1.5',
      default: 'h-2.5',
      lg: 'h-4',
    }
    
    return (
      <div className={cn("relative", className)} ref={ref} {...props}>
        <div 
          className={cn(
            "w-full rounded-full bg-gray-100 overflow-hidden",
            sizes[size]
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-premium",
              variants[variant],
              animated && "animate-pulse-subtle"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showValue && (
          <span className="absolute right-0 -top-6 text-xs font-medium text-deep-600">
            {Math.round(percentage)}%
          </span>
        )}
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
