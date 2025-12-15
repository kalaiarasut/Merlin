import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  value: string | number
  change?: number | { value: number; type: 'increase' | 'decrease' | 'neutral' }
  changeLabel?: string
  icon?: LucideIcon | React.ReactNode
  iconColor?: string
  iconBg?: string
  subtitle?: string
  loading?: boolean
}

const colorMap: Record<string, { bg: string; text: string }> = {
  ocean: { bg: 'bg-ocean-50', text: 'text-ocean-600' },
  marine: { bg: 'bg-marine-50', text: 'text-marine-600' },
  coral: { bg: 'bg-coral-50', text: 'text-coral-600' },
  abyss: { bg: 'bg-abyss-50', text: 'text-abyss-600' },
  deep: { bg: 'bg-deep-50', text: 'text-deep-600' },
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, title, value, change, changeLabel, icon, iconColor, iconBg, subtitle, loading, ...props }, ref) => {
    // Normalize change prop
    const normalizedChange = typeof change === 'number' 
      ? { value: change, type: change >= 0 ? 'increase' as const : 'decrease' as const }
      : change

    // Get color classes - use lighter shades
    const colorClasses = typeof iconColor === 'string' && colorMap[iconColor] 
      ? colorMap[iconColor] 
      : { bg: iconBg || 'bg-ocean-50', text: iconColor || 'text-ocean-600' }

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-6 shadow-card transition-all duration-300 ease-premium hover:shadow-card-hover hover:-translate-y-0.5",
          className
        )}
        {...props}
      >
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-gradient-to-br from-ocean-50 to-transparent opacity-50" />

        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-deep-500">{title}</p>
              {loading ? (
                <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-lg" />
              ) : (
                <p className="text-3xl font-bold text-deep-900 tracking-tight">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </p>
              )}
              {subtitle && (
                <p className="text-xs text-deep-400">{subtitle}</p>
              )}
            </div>
            
            {icon && (
              <div className={cn("p-3 rounded-xl", colorClasses.bg)}>
                {(() => {
                  // If icon is a React element (JSX), clone it with additional className
                  if (React.isValidElement(icon)) {
                    return React.cloneElement(icon as React.ReactElement, { 
                      className: cn((icon as React.ReactElement).props?.className, colorClasses.text, "w-6 h-6") 
                    });
                  }
                  // If icon is a component reference (LucideIcon), render it
                  if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)) {
                    const IconComponent = icon as LucideIcon;
                    return <IconComponent className={cn(colorClasses.text, "w-6 h-6")} />;
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
          
          {normalizedChange && (
            <div className="mt-4 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                  normalizedChange.type === 'increase' && "bg-marine-100 text-marine-700",
                  normalizedChange.type === 'decrease' && "bg-abyss-100 text-abyss-700",
                  normalizedChange.type === 'neutral' && "bg-gray-100 text-gray-700"
                )}
              >
                {normalizedChange.type === 'increase' && '↑'}
                {normalizedChange.type === 'decrease' && '↓'}
                {Math.abs(normalizedChange.value)}%
              </span>
              <span className="text-xs text-deep-400">{changeLabel || 'vs last period'}</span>
            </div>
          )}
        </div>
      </div>
    )
  }
)
StatCard.displayName = "StatCard"

export { StatCard }
