/**
 * PageTransition — CSS transform-based page transitions.
 *
 * Wraps route content and applies push animations based on navigation direction:
 * - Landing → Plan: push up (landing slides up, plan slides from bottom)
 * - Plan → Builder: push left (plan slides left, builder slides from right)
 * - Builder → back: push right (builder slides right, previous slides from left)
 * - Plan → Landing (close): push down (plan slides down, landing slides from top)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

const DURATION = 500;
const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function getDirection(from: string, to: string): Direction {
  // Landing → Plan: push up
  if (from === "/" && to.startsWith("/plan")) return "up";
  // Plan → Landing (close): push down
  if (from.startsWith("/plan") && to === "/") return "down";
  // Plan → Builder: push left
  if (from.startsWith("/plan") && to.startsWith("/studio/project")) return "left";
  // Builder → back: push right
  if (from.startsWith("/studio/project") && (to === "/" || to.startsWith("/plan") || to.startsWith("/studio/home")))
    return "right";
  return "none";
}

function getEnterTransform(dir: Direction): string {
  switch (dir) {
    case "up": return "translateY(100vh)";
    case "down": return "translateY(-100vh)";
    case "left": return "translateX(100vw)";
    case "right": return "translateX(-100vw)";
    default: return "none";
  }
}

function getExitTransform(dir: Direction): string {
  switch (dir) {
    case "up": return "translateY(-100vh)";
    case "down": return "translateY(100vh)";
    case "left": return "translateX(-100vw)";
    case "right": return "translateX(100vw)";
    default: return "none";
  }
}

export function PageTransition({
  children,
  routeKey,
}: {
  children: ReactNode;
  routeKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRouteRef = useRef(routeKey);
  const [animating, setAnimating] = useState(false);
  const prevChildrenRef = useRef<ReactNode>(null);
  const [exitChildren, setExitChildren] = useState<ReactNode>(null);

  useEffect(() => {
    const prevRoute = prevRouteRef.current;
    if (prevRoute === routeKey) return;

    const dir = getDirection(prevRoute, routeKey);
    prevRouteRef.current = routeKey;

    if (dir === "none") return;

    // Store exiting content
    setExitChildren(prevChildrenRef.current);
    setAnimating(true);

    const el = containerRef.current;
    if (!el) return;

    // Enter animation for new content
    const enterEl = el.querySelector("[data-page-enter]") as HTMLElement | null;
    const exitEl = el.querySelector("[data-page-exit]") as HTMLElement | null;

    if (enterEl) {
      enterEl.style.transform = getEnterTransform(dir);
      enterEl.style.transition = "none";
      // Force reflow
      enterEl.offsetHeight;
      enterEl.style.transition = `transform ${DURATION}ms ${EASING}`;
      enterEl.style.transform = "translate(0, 0)";
    }

    if (exitEl) {
      exitEl.style.transform = "translate(0, 0)";
      exitEl.style.transition = `transform ${DURATION}ms ${EASING}`;
      // Force reflow
      exitEl.offsetHeight;
      exitEl.style.transform = getExitTransform(dir);
    }

    const timer = setTimeout(() => {
      setAnimating(false);
      setExitChildren(null);
    }, DURATION);

    return () => clearTimeout(timer);
  }, [routeKey]);

  // Store current children for future exit animations
  useEffect(() => {
    prevChildrenRef.current = children;
  }, [children]);

  if (!animating) {
    return (
      <div ref={containerRef} className="h-full w-full">
        <div data-page-enter className="h-full w-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Exiting page */}
      <div data-page-exit className="absolute inset-0 z-10">
        {exitChildren}
      </div>
      {/* Entering page */}
      <div data-page-enter className="absolute inset-0 z-20">
        {children}
      </div>
    </div>
  );
}
