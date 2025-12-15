import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-ocean-100 text-ocean-700 border border-ocean-200/50",
        secondary: "bg-deep-100 text-deep-700 border border-deep-200/50",
        success: "bg-marine-100 text-marine-700 border border-marine-200/50",
        warning: "bg-coral-100 text-coral-700 border border-coral-200/50",
        destructive: "bg-abyss-100 text-abyss-700 border border-abyss-200/50",
        outline: "border-2 border-current bg-transparent",
        premium: "bg-gradient-to-r from-ocean-500 to-ocean-600 text-white shadow-sm",
      },
      size: {
        default: "px-2.5 py-0.5",
        sm: "px-2 py-0.5 text-2xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
  dotColor?: string
}

function Badge({ className, variant, size, dot, dotColor, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span 
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotColor || (variant === 'success' ? 'bg-marine-500' : 
                        variant === 'warning' ? 'bg-coral-500' : 
                        variant === 'destructive' ? 'bg-abyss-500' : 
                        'bg-ocean-500')
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
