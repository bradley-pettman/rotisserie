import type * as React from "react";

import { cn } from "~/lib/utils";

/** A small caps label above a block of content. */
export function SectionHeading({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      className={cn(
        "text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase",
        className
      )}
    >
      {children}
    </h3>
  );
}

/** The "there is nothing here" placeholder, styled as a slot to be filled. */
export function EmptyState({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground border-border/70 rounded-lg border border-dashed px-4 py-8 text-center text-sm",
        className
      )}
    >
      {children}
    </p>
  );
}
