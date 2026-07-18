"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  textColor?: "dark" | "light";
}

const sizes = {
  sm: { img: 60, text: "text-base" },
  md: { img: 80, text: "text-xl"  },
  lg: { img: 100, text: "text-3xl" },
};


export function Logo({
  size = "md",
  showText = true,
  textColor = "dark",
}: LogoProps) {
  const s = sizes[size];

  return (
    <div className="flex items-center select-none">
      {/* Logo image — swap /public/logo.png each season */}
      <div className="flex-shrink-0 -mr-5">
        <Image
          src="/logo.png"
          alt="ShuroqX Logo"
          width={s.img}
          height={s.img}
          className="object-contain"
          priority
        />
      </div>

      {/* Brand name */}
      {showText && (
        <span
          className={`font-extrabold tracking-tight leading-none ${s.text} ${
            textColor === "dark" ? "text-primary" : "text-white"
          }`}
          style={{ fontFamily: "inherit" }}
        >
          Shuroq
          <span
            style={{
              background: "linear-gradient(135deg, #006d77 0%, #82d3de 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            X
          </span>
        </span>
      )}
    </div>
  );
}