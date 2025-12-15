/**
 * Lazy Loading Image Component
 * 
 * Features:
 * - Intersection Observer for lazy loading
 * - Placeholder/skeleton while loading
 * - Error handling with fallback
 * - Blur-up effect
 * - Progressive loading
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ImageOff, Loader2 } from 'lucide-react';

interface LazyImageProps {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  placeholderSrc?: string;
  fallbackSrc?: string;
  aspectRatio?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  threshold?: number;
  rootMargin?: string;
  blurUp?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  onClick?: () => void;
}

export default function LazyImage({
  src,
  alt,
  width,
  height,
  className,
  placeholderSrc,
  fallbackSrc = '/placeholder-image.png',
  aspectRatio,
  objectFit = 'cover',
  threshold = 0.1,
  rootMargin = '100px',
  blurUp = true,
  onLoad,
  onError,
  onClick,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const element = imgRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(element);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  // Load image when in view
  useEffect(() => {
    if (!isInView || !src) return;

    const img = new Image();
    
    img.onload = () => {
      setCurrentSrc(src);
      setIsLoaded(true);
      setHasError(false);
      onLoad?.();
    };

    img.onerror = () => {
      setHasError(true);
      setCurrentSrc(fallbackSrc);
      onError?.();
    };

    img.src = src;
  }, [isInView, src, fallbackSrc, onLoad, onError]);

  // Generate placeholder gradient
  const generatePlaceholderGradient = useCallback(() => {
    // Simple hash function to generate consistent colors from src
    let hash = 0;
    for (let i = 0; i < (src || '').length; i++) {
      hash = src.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash % 360);
    return `linear-gradient(135deg, hsl(${hue}, 30%, 90%) 0%, hsl(${(hue + 30) % 360}, 30%, 85%) 100%)`;
  }, [src]);

  const containerStyle: React.CSSProperties = {
    width: width || '100%',
    height: height || (aspectRatio ? undefined : '100%'),
    aspectRatio: aspectRatio,
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <div
      ref={imgRef}
      className={cn(
        'bg-gray-100 dark:bg-gray-800 rounded overflow-hidden',
        onClick && 'cursor-pointer',
        className
      )}
      style={containerStyle}
      onClick={onClick}
    >
      {/* Placeholder */}
      {!isLoaded && !hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: placeholderSrc ? undefined : generatePlaceholderGradient() }}
        >
          {placeholderSrc ? (
            <img
              src={placeholderSrc}
              alt=""
              className={cn(
                'w-full h-full object-cover',
                blurUp && 'blur-sm scale-105'
              )}
            />
          ) : (
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          )}
        </div>
      )}

      {/* Error state */}
      {hasError && !currentSrc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800">
          <ImageOff className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-xs text-gray-500">Failed to load</span>
        </div>
      )}

      {/* Actual image */}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          className={cn(
            'w-full h-full transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            blurUp && !isLoaded && 'blur-sm'
          )}
          style={{ objectFit }}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}

/**
 * Image Gallery with lazy loading
 */
interface ImageGalleryProps {
  images: Array<{
    src: string;
    alt: string;
    thumbnail?: string;
  }>;
  columns?: number;
  gap?: number;
  onImageClick?: (index: number) => void;
  className?: string;
}

export function LazyImageGallery({
  images,
  columns = 4,
  gap = 4,
  onImageClick,
  className,
}: ImageGalleryProps) {
  return (
    <div
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap * 4}px`,
      }}
    >
      {images.map((image, index) => (
        <LazyImage
          key={index}
          src={image.src}
          alt={image.alt}
          placeholderSrc={image.thumbnail}
          aspectRatio="1/1"
          onClick={() => onImageClick?.(index)}
          className="hover:opacity-90 transition-opacity"
        />
      ))}
    </div>
  );
}

/**
 * Avatar with lazy loading
 */
interface LazyAvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
}

export function LazyAvatar({
  src,
  alt,
  size = 'md',
  fallback,
  className,
}: LazyAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const initials = fallback || alt
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (!src || hasError) {
    return (
      <div
        className={cn(
          'rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white font-medium',
          sizeClasses[size],
          className
        )}
      >
        {initials}
      </div>
    );
  }

  return (
    <LazyImage
      src={src}
      alt={alt}
      className={cn('rounded-full', sizeClasses[size], className)}
      objectFit="cover"
      onError={() => setHasError(true)}
    />
  );
}

export { LazyImage };
