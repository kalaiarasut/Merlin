import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, error, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-deep-400">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-12 w-full rounded-xl border-2 bg-white/80 backdrop-blur-sm px-4 py-3 text-sm transition-all duration-200 ease-premium",
            "border-gray-200 hover:border-gray-300",
            "placeholder:text-deep-400",
            "focus:outline-none focus:border-ocean-400 focus:ring-4 focus:ring-ocean-100",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            icon && "pl-11",
            error && "border-abyss-300 focus:border-abyss-400 focus:ring-abyss-100",
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = "Input"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[120px] w-full rounded-xl border-2 bg-white/80 backdrop-blur-sm px-4 py-3 text-sm transition-all duration-200 ease-premium",
        "border-gray-200 hover:border-gray-300",
        "placeholder:text-deep-400",
        "focus:outline-none focus:border-ocean-400 focus:ring-4 focus:ring-ocean-100",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100",
        "resize-none",
        error && "border-abyss-300 focus:border-abyss-400 focus:ring-abyss-100",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(({ className, error, children, ...props }, ref) => {
  return (
    <select
      className={cn(
        "flex h-12 w-full rounded-xl border-2 bg-white/80 backdrop-blur-sm px-4 py-3 text-sm transition-all duration-200 ease-premium appearance-none cursor-pointer",
        "border-gray-200 hover:border-gray-300",
        "focus:outline-none focus:border-ocean-400 focus:ring-4 focus:ring-ocean-100",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100",
        "bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%208l4%204%204-4%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_1rem_center]",
        error && "border-abyss-300 focus:border-abyss-400 focus:ring-abyss-100",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  )
})
Select.displayName = "Select"

export { Input, Textarea, Select }
