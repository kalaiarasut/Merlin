/**
 * Switch Component
 * 
 * A toggle switch for boolean options.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    id?: string;
}

export function Switch({
    checked = false,
    onCheckedChange,
    disabled = false,
    className,
    id,
}: SwitchProps) {
    const handleClick = () => {
        if (!disabled && onCheckedChange) {
            onCheckedChange(!checked);
        }
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            id={id}
            onClick={handleClick}
            className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 focus-visible:ring-offset-2',
                checked ? 'bg-ocean-500' : 'bg-gray-200',
                disabled && 'cursor-not-allowed opacity-50',
                className
            )}
        >
            <span
                className={cn(
                    'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
                    checked ? 'translate-x-4' : 'translate-x-0'
                )}
            />
        </button>
    );
}

export default Switch;
