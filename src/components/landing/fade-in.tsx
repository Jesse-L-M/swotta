"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function FadeIn({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShouldReduceMotion(true);
      setIsVisible(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

  const style: CSSProperties = shouldReduceMotion
    ? {
        animation: "none",
        opacity: 1,
        transform: "translateY(0)",
      }
    : isVisible
    ? {
        animation: `fadeSlideIn 600ms cubic-bezier(0.25, 0.1, 0.25, 1) ${delay}s both`,
        ["--fade-slide-start-y" as string]: `${y}px`,
      }
    : {
        opacity: 0,
        transform: `translateY(${y}px)`,
      };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
