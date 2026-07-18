'use client';
import * as React from 'react';
import { useId } from 'react';
import {
  Root as RadioGroupRoot,
  Item as RadioGroupItem,
} from '@radix-ui/react-radio-group';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

/**
 * Defines the props for the Rating component.
 */
export interface RatingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The current rating value. */
  value: number;
  /** Callback that fires when the rating value changes. */
  onValueChange?: (value: number) => void;
  /** The total number of rating items to display. */
  count?: number;
  /** If true, the rating cannot be changed by the user. */
  readOnly?: boolean;
  /** If true, the component is disabled and non-interactive. */
  disabled?: boolean;
  /** The icon component to be used for rating items (e.g., Star). */
  icon?: React.ElementType;
  /** The visual variant of the rating component. */
  variant?: 'star' | 'gradient' | 'text' | 'emoji';
  /** Custom class names for the filled and empty states of the icons. */
  colors?: { fill: string; empty: string };
  /** An array of strings to use as labels for the 'text' variant. */
  labels?: string[];
  /** An array of strings (emojis) to use for the 'emoji' variant. */
  emojis?: string[];
  /** An array of strings to display as tooltips on hover for each rating item. */
  tooltips?: string[];
}

/**
 * A highly customizable and animated rating component with multiple variants,
 * including stars, emojis, text, and a unique gradient fill.
 */
const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      className,
      variant = 'star',
      value = 0,
      onValueChange,
      count = 5,
      readOnly = false,
      disabled = false,
      icon: Icon = Star,
      colors = {
        fill: 'text-yellow-500 fill-yellow-500',
        empty: 'text-muted',
      },
      labels,
      emojis,
      tooltips,
      ...props
    },
    ref
  ) => {
    const [hoverValue, setHoverValue] = React.useState<number>(0);
    const [isConfirming, setIsConfirming] = React.useState<boolean>(false);
    const [tooltipText, setTooltipText] = React.useState<string>('');
    const [isTooltipVisible, setIsTooltipVisible] =
      React.useState<boolean>(false);
    const [sparklePosition, setSparklePosition] = React.useState<{
      top: number;
      left: number;
    } | null>(null);
    const id = useId();
    const containerRef = React.useRef<HTMLDivElement>(null);
    const tooltipRef = React.useRef<HTMLDivElement>(null);
    const sparklesRef = React.useRef<HTMLDivElement>(null);
    const lastClickPosition = React.useRef<{
      top: number;
      left: number;
    } | null>(null);
    useGSAP(
      () => {
        gsap.fromTo(
          `.rating-item-${id}`,
          { scale: 0, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.4,
            ease: 'back.out(1.7)',
            stagger: 0.05,
          }
        );
      },
      { scope: containerRef, dependencies: [variant] }
    );
    useGSAP(
      () => {
        gsap.to(tooltipRef.current, {
          opacity: isTooltipVisible ? 1 : 0,
          y: isTooltipVisible ? -8 : 0,
          duration: 0.2,
          ease: 'power2.out',
        });
      },
      { dependencies: [isTooltipVisible] }
    );
    useGSAP(
      () => {
        if (readOnly || disabled) return;
        const baseSelector = `.rating-item-${id}`;
        if (variant === 'star' || variant === 'text') {
          const hoverSelector =
            hoverValue > 0 ? `${baseSelector}-${hoverValue}` : null;
          if (hoverSelector) {
            gsap.to(hoverSelector, {
              y: -4,
              scale: 1.15,
              duration: 0.2,
              ease: 'power2.out',
            });
            gsap.to(`${baseSelector}:not(${hoverSelector})`, {
              y: 0,
              scale: 1,
              duration: 0.2,
              ease: 'power2.out',
            });
          } else {
            gsap.to(baseSelector, {
              y: 0,
              scale: 1,
              duration: 0.2,
              ease: 'power2.out',
            });
          }
        }
        if (variant === 'emoji') {
          const emojiItems = containerRef.current?.querySelectorAll(
            `.rating-item-${id}-emoji`
          );
          emojiItems?.forEach((item, index) => {
            const itemValue = index + 1;
            const targetScale =
              itemValue === hoverValue || itemValue === value ? 1.25 : 1;
            gsap.to(item, {
              scale: targetScale,
              duration: 0.2,
              ease: 'power2.out',
            });
          });
        }
      },
      {
        dependencies: [hoverValue, value, readOnly, disabled],
        scope: containerRef,
      }
    );
    useGSAP(
      () => {
        if (!sparklePosition) return;
        const sparks = sparklesRef.current?.querySelectorAll('svg');
        if (!sparks || sparks.length === 0) return;
        const masterTimeline = gsap.timeline({
          onComplete: () => {
            // DECISION: The `isConfirming` state prevents interaction spam while the sparkle animation is playing.
            setIsConfirming(false);
            setSparklePosition(null);
          },
        });
        masterTimeline.set(sparklesRef.current, { opacity: 1 });
        const angleIncrement = 360 / sparks.length;
        const angleOffset = gsap.utils.random(0, 360);
        sparks.forEach((spark, index) => {
          const tl = gsap.timeline();
          const angle = angleIncrement * index + angleOffset;
          // COMPLEXITY: The radius is dynamically retrieved from a method exposed by the child `Sparkles` component.
          // This allows for a structured, concentric burst effect where different shapes travel different distances.
          const radius = (sparklesRef.current as any)?.getRadius(index);
          gsap.set(spark, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            xPercent: -50,
            yPercent: -50,
            scale: 0,
            opacity: 1,
            rotation: angle - 90,
          });
          tl.to(spark, {
            x: Math.cos(angle * (Math.PI / 180)) * radius,
            y: Math.sin(angle * (Math.PI / 180)) * radius,
            scale: 1,
            duration: 0.6,
            ease: 'power3.out',
          }).to(
            spark,
            {
              opacity: 0,
              scale: 0,
              duration: 0.4,
              ease: 'power3.in',
            },
            '-=0.3'
          );
          masterTimeline.add(tl, 0);
        });
      },
      { dependencies: [sparklePosition] }
    );
    const handleMouseEnter = (itemValue: number) => {
      if (disabled || readOnly || isConfirming) return;
      setHoverValue(itemValue);
      if (tooltips && tooltips[itemValue - 1]) {
        setTooltipText(tooltips[itemValue - 1]);
        setIsTooltipVisible(true);
      }
    };
    const handleMouseLeave = () => {
      if (disabled || readOnly) return;
      setHoverValue(0);
      setIsTooltipVisible(false);
    };
    const handleClick = (e: React.MouseEvent<HTMLLabelElement>) => {
      if (!containerRef.current) return;
      // WHY: We must store the click position relative to the container *before* the state update
      // triggers the animation, ensuring the sparkles emanate from the correct origin.
      const rect = e.currentTarget.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      lastClickPosition.current = {
        top: rect.top - containerRect.top + rect.height / 2,
        left: rect.left - containerRect.left + rect.width / 2,
      };
    };
    const renderStarVariant = () => {
      const displayValue = hoverValue || value;
      return [...Array(count)].map((_, index) => {
        const itemValue = index + 1;
        const isFilled = itemValue <= displayValue;
        const uniqueId = `rating-star-${id}-${itemValue}`;
        return (
          <label
            key={uniqueId}
            htmlFor={uniqueId}
            className={cn(
              'rating-item',
              `rating-item-${id}`,
              `rating-item-${id}-${itemValue}`
            )}
            onMouseEnter={() => handleMouseEnter(itemValue)}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          >
            <RadioGroupItem
              value={String(itemValue)}
              id={uniqueId}
              className='sr-only'
            />
            <Icon
              className={cn(
                'h-6 w-6 transition-colors',
                isFilled ? colors.fill : colors.empty
              )}
            />
          </label>
        );
      });
    };
    const renderGradientVariant = () => {
      const iconContainerRef = React.useRef<HTMLDivElement>(null);
      const fillIconRef = React.useRef<HTMLDivElement>(null);
      const prevValueRef = React.useRef(value);
      useGSAP(
        () => {
          gsap.to(fillIconRef.current, {
            clipPath: `inset(${100 - (value / count) * 100}% 0 0 0)`,
            duration: 0.4,
            ease: 'power2.out',
          });
        },
        { dependencies: [value, count] }
      );
      useGSAP(
        () => {
          if (
            !readOnly &&
            !disabled &&
            prevValueRef.current < count &&
            value === count
          ) {
            const iconRect =
              iconContainerRef.current?.getBoundingClientRect();
            const containerRect =
              containerRef.current?.getBoundingClientRect();
            if (iconRect && containerRect) {
              setIsConfirming(true);
              setSparklePosition({
                top: iconRect.top - containerRect.top + iconRect.height / 2,
                left:
                  iconRect.left - containerRect.left + iconRect.width / 2,
              });
            }
          }
          prevValueRef.current = value;
        },
        { dependencies: [value] }
      );
      const handlePointerInteraction = (
        e: React.PointerEvent<HTMLDivElement>
      ) => {
        if (readOnly || disabled || isConfirming) return;
        const rect = iconContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pointerY = e.clientY - rect.top;
        let percentage = 1 - pointerY / rect.height;
        percentage = Math.max(0, Math.min(1, percentage));
        const newValue = Math.round(percentage * count);
        onValueChange?.(newValue);
      };
      return (
        <div
          ref={iconContainerRef}
          className={cn(
            'relative h-8 w-8 rating-item',
            `rating-item-${id}`,
            {
              'cursor-pointer': !disabled && !readOnly,
              'cursor-not-allowed opacity-50': disabled || readOnly,
            }
          )}
          onPointerDown={handlePointerInteraction}
          onPointerMove={(e) => {
            if (e.buttons === 1) handlePointerInteraction(e);
          }}
        >
          <Icon className={cn('h-full w-full', colors.empty)} />
          <div
            ref={fillIconRef}
            className='absolute top-0 left-0 h-full w-full'
            style={{ clipPath: `inset(100% 0 0 0)` }}
          >
            <Icon className={cn('h-full w-full', colors.fill)} />
          </div>
        </div>
      );
    };
    const renderTextVariant = () => {
      const displayValue = hoverValue || value;
      const textLabels =
        labels || [...Array(count)].map((_, i) => String(i + 1));
      return textLabels.map((label, index) => {
        const itemValue = index + 1;
        const isHighlighted = itemValue === displayValue;
        const uniqueId = `rating-text-${id}-${itemValue}`;
        return (
          <label
            key={uniqueId}
            htmlFor={uniqueId}
            className={cn(
              'text-center font-medium rounded-md px-3 py-1 transition-colors rating-item',
              `rating-item-${id}`,
              `rating-item-${id}-${itemValue}`,
              {
                'cursor-pointer': !disabled && !readOnly,
                'cursor-not-allowed opacity-50': disabled || readOnly,
              },
              isHighlighted
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            onMouseEnter={() => handleMouseEnter(itemValue)}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          >
            <RadioGroupItem
              value={String(itemValue)}
              id={uniqueId}
              className='sr-only'
            />
            {label}
          </label>
        );
      });
    };
    const renderEmojiVariant = () => {
      const displayValue = hoverValue || value;
      const emojiSet = emojis || ['😡', '😟', '😐', '😊', '😍'];
      return emojiSet.map((emoji, index) => {
        const itemValue = index + 1;
        const isSelected = itemValue === value;
        const uniqueId = `rating-emoji-${id}-${itemValue}`;
        return (
          <label
            key={uniqueId}
            htmlFor={uniqueId}
            className={cn(
              'text-3xl transition-opacity duration-200 ease-in-out rating-item',
              `rating-item-${id}`,
              `rating-item-${id}-emoji`,
              `rating-item-${id}-emoji-${itemValue}`,
              {
                'cursor-pointer': !disabled && !readOnly,
                'cursor-not-allowed': disabled || readOnly,
                'grayscale-0 opacity-100':
                  isSelected || itemValue === hoverValue,
                'grayscale opacity-60':
                  !isSelected && itemValue !== hoverValue,
                '!opacity-50 !grayscale': disabled || readOnly,
              }
            )}
            onMouseEnter={() => handleMouseEnter(itemValue)}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          >
            <RadioGroupItem
              value={String(itemValue)}
              id={uniqueId}
              className='sr-only'
            />
            {emoji}
          </label>
        );
      });
    };
    return (
      <div ref={ref} className='flex flex-col items-center'>
        <div
          ref={containerRef}
          className={cn('relative flex items-center', className)}
          {...props}
        >
          <div
            ref={tooltipRef}
            className='absolute bottom-full mb-2 bg-popover text-popover-foreground text-xs font-semibold px-2 py-1 rounded-md opacity-0 pointer-events-none'
          >
            {tooltipText}
          </div>
          {sparklePosition && (
            <Sparkles
              ref={sparklesRef}
              style={{
                top: sparklePosition.top,
                left: sparklePosition.left,
                transform: 'translate(-50%, -50%)',
                opacity: 0,
              }}
            />
          )}
          {(() => {
            switch (variant) {
              case 'gradient':
                return renderGradientVariant();
              default:
                return (
                  <RadioGroupRoot
                    key={`${variant}-${id}`}
                    className='flex items-center gap-2'
                    value={String(value)}
                    onValueChange={(val) => {
                      if (readOnly || isConfirming) return;
                      const newValue = Number(val);
                      onValueChange?.(newValue);
                      setHoverValue(0);
                      setIsTooltipVisible(false);
                      if (newValue < 3) return;
                      if (lastClickPosition.current) {
                        setIsConfirming(true);
                        setSparklePosition(lastClickPosition.current);
                        lastClickPosition.current = null;
                      }
                    }}
                    disabled={disabled}
                    aria-label='Rating'
                  >
                    {variant === 'text' && renderTextVariant()}
                    {variant === 'emoji' && renderEmojiVariant()}
                    {variant === 'star' && renderStarVariant()}
                  </RadioGroupRoot>
                );
            }
          })()}
        </div>
      </div>
    );
  }
);
Rating.displayName = 'Rating';
export { Rating };

interface ShapeProps extends React.SVGProps<SVGSVGElement> {
  color?: string;
}
const Sparkle = ({ color = '#FFC700', ...props }: ShapeProps) => (
  <svg width='12' height='12' viewBox='0 0 12 12' fill='none' {...props}>
    <path
      d='M6 0L7.34315 4.65685L12 6L7.34315 7.34315L6 12L4.65685 7.34315L0 6L4.65685 4.65685L6 0Z'
      fill={color}
    />
  </svg>
);
const Line = ({ color = '#FFC700', ...props }: ShapeProps) => (
  <svg width='2' height='12' viewBox='0 0 12 12' fill='none' {...props}>
    <path
      d='M1 0V12'
      stroke={color}
      strokeWidth='2'
      strokeLinecap='round'
    />
  </svg>
);
const Circle = ({ color = '#FFC700', ...props }: ShapeProps) => (
  <svg width='8' height='8' viewBox='0 0 12 12' fill='none' {...props}>
    <circle cx='4' cy='4' r='4' fill={color} />
  </svg>
);
const Triangle = ({ color = '#FFC700', ...props }: ShapeProps) => (
  <svg width='12' height='12' viewBox='0 0 12 12' fill='none' {...props}>
    <polygon points='6,0 12,10 0,10' fill={color} />
  </svg>
);
const Squiggle = ({ color = '#FFC700', ...props }: ShapeProps) => (
  <svg width='8' height='14' viewBox='0 0 8 14' fill='none' {...props}>
    <path
      d='M1 1C3.66667 -0.333333, 6.33333 1, 7 3C7.66667 5, 5 6, 4 7.5C3 9, 5.5 11.1667, 7 13'
      stroke={color}
      strokeWidth='2'
      strokeLinecap='round'
    />
  </svg>
);
export const Sparkles = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const colors = ['#F778BA', '#63D2F2', '#F9DD70', '#A57BF1', '#72E8A4'];
  const particlePattern = [Sparkle, Circle, Triangle, Line];
  const particleComponents = Array(16)
    .fill(null)
    .map((_, i) => particlePattern[i % particlePattern.length]);
  const radiusMap: { [key: string]: number | (() => number) } = {
    Sparkle: 60,
    Circle: 40,
    Triangle: 50,
    Line: 70,
    Squiggle: () => gsap.utils.random(30, 60),
  };
  const internalRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => {
    const el = internalRef.current;
    if (el) {
      // WHY: This exposes a custom `getRadius` function to the parent component.
      // This is a non-standard but effective way for the parent's GSAP animation hook
      // to query particle-specific data without prop-drilling or complex state management.
      (el as any).getRadius = (index: number) => {
        const Component = particleComponents[index];
        const radiusOrFn = radiusMap[Component.name] || 45;
        return typeof radiusOrFn === 'function' ? radiusOrFn() : radiusOrFn;
      };
    }
    return el as HTMLDivElement;
  });
  return (
    <div
      ref={internalRef}
      className='absolute pointer-events-none'
      {...props}
    >
      {particleComponents.map((Component, index) => {
        const color = colors[index % colors.length];
        return <Component key={index} color={color} className='absolute' />;
      })}
    </div>
  );
});
Sparkles.displayName = 'Sparkles';
