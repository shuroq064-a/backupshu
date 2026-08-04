"use client";

import { useEffect, useRef } from "react";

interface AnimatedCheckmarkProps {
  size?: number;
  onComplete?: () => void;
}

export function AnimatedCheckmark({ size = 80, onComplete }: AnimatedCheckmarkProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), 1400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <style>{`
        .ax-check-circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: ax-draw 0.6s cubic-bezier(0.65, 0, 0.45, 1) 0.1s forwards;
        }
        .ax-check-mark {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: ax-draw 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
        }
        .ax-check-pulse {
          opacity: 0;
          animation: ax-pulse-ring 0.6s ease-out 0.75s forwards;
        }
        @keyframes ax-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ax-pulse-ring {
          0% { opacity: 0.5; transform: scale(0.9); }
          100% { opacity: 0; transform: scale(1.4); }
        }
      `}</style>
      <svg
        ref={svgRef}
        viewBox="0 0 52 52"
        width={size}
        height={size}
        className="block"
      >
        {/* Pulse ring */}
        <circle
          className="ax-check-pulse"
          cx="26"
          cy="26"
          r="25"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          style={{ transformOrigin: "center" }}
        />
        {/* Circle stroke-draw */}
        <circle
          className="ax-check-circle"
          cx="26"
          cy="26"
          r="25"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Checkmark stroke-draw */}
        <path
          className="ax-check-mark"
          d="M14.1 27.2l7.1 7.2 16.7-16.8"
          fill="none"
          stroke="#22c55e"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
