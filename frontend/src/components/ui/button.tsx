import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: 
          "bg-gradient-to-r from-ocean-500 to-ocean-600 text-white shadow-md hover:shadow-lg hover:from-ocean-600 hover:to-ocean-700 border border-ocean-600/20",
        destructive:
          "bg-gradient-to-r from-abyss-500 to-abyss-600 text-white shadow-md hover:shadow-lg hover:from-abyss-600 hover:to-abyss-700 border border-abyss-600/20",
        outline:
          "border-2 border-ocean-200 dark:border-ocean-700 bg-white/80 dark:bg-deep-800/80 backdrop-blur-sm text-ocean-700 dark:text-ocean-300 hover:bg-ocean-50 dark:hover:bg-ocean-900/30 hover:border-ocean-300 dark:hover:border-ocean-600 shadow-sm",
        secondary:
          "bg-deep-100 dark:bg-deep-700 text-deep-700 dark:text-gray-200 hover:bg-deep-200 dark:hover:bg-deep-600 shadow-sm border border-deep-200/50 dark:border-deep-600/50",
        ghost: 
          "text-deep-600 dark:text-gray-300 hover:bg-deep-100/80 dark:hover:bg-deep-700/80 hover:text-deep-900 dark:hover:text-white",
        link: 
          "text-ocean-600 dark:text-ocean-400 underline-offset-4 hover:underline hover:text-ocean-700 dark:hover:text-ocean-300",
        premium:
          "bg-gradient-to-r from-ocean-500 via-ocean-600 to-ocean-700 text-white shadow-lg shadow-ocean-500/25 hover:shadow-xl hover:shadow-ocean-500/30 border border-white/10 hover:-translate-y-0.5",
        glass:
          "bg-white/60 dark:bg-deep-800/60 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 text-deep-700 dark:text-gray-200 shadow-lg hover:bg-white/80 dark:hover:bg-deep-700/80 hover:shadow-xl",
        success:
          "bg-gradient-to-r from-marine-500 to-marine-600 text-white shadow-md hover:shadow-lg hover:from-marine-600 hover:to-marine-700 border border-marine-600/20",
      },
      size: {
        default: "h-11 px-5 py-2.5 rounded-xl",
        sm: "h-9 px-4 rounded-lg text-xs",
        lg: "h-12 px-8 rounded-xl text-base",
        xl: "h-14 px-10 rounded-2xl text-lg font-semibold",
        icon: "h-11 w-11 rounded-xl",
        "icon-sm": "h-9 w-9 rounded-lg",
        "icon-lg": "h-12 w-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg 
            className="animate-spin -ml-1 mr-2 h-4 w-4" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
