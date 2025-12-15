import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'glass' | 'premium' | 'bordered' | 'elevated'
    hover?: boolean
  }
>(({ className, variant = 'default', hover = false, ...props }, ref) => {
  const variants = {
    default: "bg-white dark:bg-deep-800 border border-gray-100 dark:border-gray-700/50 shadow-card dark:shadow-none",
    glass: "bg-white/80 dark:bg-deep-800/80 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 shadow-md dark:shadow-none",
    premium: "bg-gradient-to-br from-white to-gray-50/50 dark:from-deep-800 dark:to-deep-900/50 border border-gray-100 dark:border-gray-700/50 shadow-card dark:shadow-none",
    bordered: "bg-white dark:bg-deep-800 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none",
    elevated: "bg-white dark:bg-deep-800 shadow-premium dark:shadow-none border border-gray-50 dark:border-gray-700/50",
  }
  
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl text-card-foreground transition-all duration-300 ease-premium",
        variants[variant],
        hover && "hover:shadow-card-hover dark:hover:shadow-lg dark:hover:shadow-ocean-500/5 hover:-translate-y-0.5 cursor-pointer",
        className
      )}
      {...props}
    />
  )
})
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight text-deep-900 dark:text-gray-100",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-deep-500 dark:text-gray-400 mt-1", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
