/**
 * TemporalAnimationControl Component
 * 
 * Provides time-series playback controls for satellite oceanographic data.
 * Features:
 * - Play/Pause button
 * - Timeline slider with date labels
 * - Speed control (1x, 2x, 4x)
 * - Frame-by-frame navigation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Clock,
    Calendar,
    Gauge,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimeFrame {
    date: string;       // ISO date string (e.g., "2024-01-15")
    label: string;      // Display label (e.g., "Jan 15")
    timestamp: number;  // Unix timestamp for sorting
}

interface TemporalAnimationControlProps {
    frames: TimeFrame[];
    currentFrameIndex: number;
    onFrameChange: (index: number) => void;
    isLoading?: boolean;
    className?: string;
}

const SPEED_OPTIONS = [
    { value: 1000, label: '1x' },
    { value: 500, label: '2x' },
    { value: 250, label: '4x' },
];

export function TemporalAnimationControl({
    frames,
    currentFrameIndex,
    onFrameChange,
    isLoading = false,
    className,
}: TemporalAnimationControlProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [speedIndex, setSpeedIndex] = useState(0);
    const [isExpanded, setIsExpanded] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const currentFrame = frames[currentFrameIndex];
    const speed = SPEED_OPTIONS[speedIndex];

    // Handle play/pause
    const togglePlay = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    // Go to previous frame
    const prevFrame = useCallback(() => {
        if (currentFrameIndex > 0) {
            onFrameChange(currentFrameIndex - 1);
        }
    }, [currentFrameIndex, onFrameChange]);

    // Go to next frame
    const nextFrame = useCallback(() => {
        if (currentFrameIndex < frames.length - 1) {
            onFrameChange(currentFrameIndex + 1);
        } else {
            // Loop back to start
            onFrameChange(0);
        }
    }, [currentFrameIndex, frames.length, onFrameChange]);

    // Cycle through speed options
    const cycleSpeed = useCallback(() => {
        setSpeedIndex(prev => (prev + 1) % SPEED_OPTIONS.length);
    }, []);

    // Handle slider change
    const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const index = parseInt(e.target.value, 10);
        onFrameChange(index);
    }, [onFrameChange]);

    // Animation loop
    useEffect(() => {
        if (isPlaying && frames.length > 0 && !isLoading) {
            intervalRef.current = setInterval(() => {
                const nextIdx = (currentFrameIndex + 1) % frames.length;
                onFrameChange(nextIdx);
            }, speed.value);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isPlaying, frames.length, speed.value, isLoading, onFrameChange, currentFrameIndex]);

    // Stop playing when loading
    useEffect(() => {
        if (isLoading) {
            setIsPlaying(false);
        }
    }, [isLoading]);

    if (frames.length === 0) {
        return null;
    }

    return (
        <Card className={cn('bg-white/95 backdrop-blur-sm shadow-lg', className)}>
            <CardHeader
                className="pb-3 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-t-xl"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-ocean-500" />
                        Time Player
                    </CardTitle>
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    )}
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-3 pt-0">
                    <div className="space-y-3">
                        {/* Current Date Display */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-ocean-500" />
                                <span className="text-sm font-medium text-deep-700">
                                    {currentFrame?.label || 'No date'}
                                </span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                                {currentFrameIndex + 1} / {frames.length}
                            </Badge>
                        </div>

                        {/* Timeline Slider */}
                        <div className="relative">
                            <input
                                type="range"
                                min={0}
                                max={frames.length - 1}
                                value={currentFrameIndex}
                                onChange={handleSliderChange}
                                className="w-full h-2 bg-gradient-to-r from-ocean-200 via-ocean-400 to-ocean-600 rounded-lg appearance-none cursor-pointer accent-ocean-600"
                                disabled={isLoading}
                            />
                            {/* Date markers */}
                            <div className="flex justify-between mt-1 px-1">
                                <span className="text-[10px] text-gray-400">
                                    {frames[0]?.label}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    {frames[frames.length - 1]?.label}
                                </span>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                {/* Previous Frame */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={prevFrame}
                                    disabled={currentFrameIndex === 0 || isLoading}
                                    className="h-8 w-8 p-0"
                                >
                                    <SkipBack className="w-4 h-4" />
                                </Button>

                                {/* Play/Pause */}
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={togglePlay}
                                    disabled={isLoading}
                                    className={cn(
                                        'h-9 w-9 p-0 rounded-full',
                                        isPlaying && 'bg-ocean-600 hover:bg-ocean-700'
                                    )}
                                >
                                    {isPlaying ? (
                                        <Pause className="w-4 h-4" />
                                    ) : (
                                        <Play className="w-4 h-4 ml-0.5" />
                                    )}
                                </Button>

                                {/* Next Frame */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={nextFrame}
                                    disabled={isLoading}
                                    className="h-8 w-8 p-0"
                                >
                                    <SkipForward className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Speed Control */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={cycleSpeed}
                                className="h-8 gap-1.5 text-xs"
                            >
                                <Gauge className="w-3.5 h-3.5" />
                                {speed.label}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export default TemporalAnimationControl;
