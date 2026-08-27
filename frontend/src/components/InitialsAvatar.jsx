import React from "react";
import { avatarGradient, initials } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Avatar({ name = "", size = 40, className = "", ring = true }) {
  return (
    <div
      className={cn("flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none",
        ring && "ring-2 ring-white shadow-sm", className)}
      style={{
        width: size, height: size, background: avatarGradient(name),
        fontSize: size * 0.38,
      }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
