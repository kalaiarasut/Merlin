import * as React from "react"
import { cn } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  fallback?: string
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'xl'
  status?: 'online' | 'offline' | 'away' | 'busy'
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = 'default', status, ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false)
    
    const sizes = {
      xs: 'h-6 w-6 text-xs',
      sm: 'h-8 w-8 text-xs',
      default: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
      xl: 'h-16 w-16 text-lg',
    }
    
    const statusColors = {
      online: 'bg-marine-500',
      offline: 'bg-gray-400',
      away: 'bg-coral-500',
      busy: 'bg-abyss-500',
    }
    
    const statusSizes = {
      xs: 'h-1.5 w-1.5 border',
      sm: 'h-2 w-2 border',
      default: 'h-2.5 w-2.5 border-2',
      lg: 'h-3 w-3 border-2',
      xl: 'h-4 w-4 border-2',
    }
    
    return (
      <div className={cn("relative inline-block", className)} ref={ref} {...props}>
        <div
          className={cn(
            "rounded-full overflow-hidden bg-gradient-to-br from-ocean-400 to-ocean-600 flex items-center justify-center font-semibold text-white ring-2 ring-white shadow-md",
            sizes[size]
          )}
        >
          {src && !imageError ? (
            <img
              src={src}
              alt={alt}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <span>{fallback || alt?.charAt(0) || '?'}</span>
          )}
        </div>
        {status && (
          <span 
            className={cn(
              "absolute bottom-0 right-0 rounded-full border-white",
              statusColors[status],
              statusSizes[size]
            )}
          />
        )}
      </div>
    )
  }
)
Avatar.displayName = "Avatar"

interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  max?: number
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, max, ...props }, ref) => {
    const childArray = React.Children.toArray(children)
    const visibleChildren = max ? childArray.slice(0, max) : childArray
    const remaining = max ? childArray.length - max : 0
    
    return (
      <div className={cn("flex -space-x-2", className)} ref={ref} {...props}>
        {visibleChildren}
        {remaining > 0 && (
          <div className="h-10 w-10 rounded-full bg-deep-100 flex items-center justify-center text-sm font-medium text-deep-600 ring-2 ring-white">
            +{remaining}
          </div>
        )}
      </div>
    )
  }
)
AvatarGroup.displayName = "AvatarGroup"

// Simplified sub-components for compatibility
interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, ...props }, ref) => (
    <img
      ref={ref}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  )
)
AvatarImage.displayName = "AvatarImage"

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-ocean-400 to-ocean-600 text-white font-semibold",
        className
      )}
      {...props}
    />
  )
)
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarGroup, AvatarImage, AvatarFallback }
