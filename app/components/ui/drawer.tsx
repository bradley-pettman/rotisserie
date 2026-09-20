import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * A right-hand drawer, built on the same Radix Dialog the modal uses.
 *
 * Why a drawer and not a modal: a modal takes the screen away and asks you to
 * finish or cancel. A drawer sits BESIDE the thing it came from — the list
 * stays visible and stays scrolled where it was, so reading a recipe never
 * loses your place in the list you were reading it from.
 *
 * Why not a new page: a page navigation throws the list away entirely and
 * makes Back the only way home.
 *
 * The rule this codebase follows: a drawer is for ONE decision made against
 * the context behind it; a page is for a task. The boundary is width — past
 * `wide` a drawer is a cramped page with a shadow on it, and the form it holds
 * belongs on a real route. The recipe editor is the worked example.
 */
const WIDTHS = {
  /** Quick actions: log a cook, assign a meal. */
  compact: "sm:max-w-[26rem]",
  /** Reading a recipe: ingredients and steps side by side with the list. */
  default: "sm:max-w-[34rem]",
  /** Editing something short. Anything bigger wants a page. */
  wide: "sm:max-w-[46rem]",
} as const;

export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  width = "default",
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  width?: keyof typeof WIDTHS;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            // Deliberately light. A modal's job is to take the screen away;
            // a drawer's is to sit beside what you were reading, so the list
            // behind has to stay legible rather than become a grey field.
            "fixed inset-0 z-50 bg-foreground/10",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "bg-card fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-2xl outline-none",
            "duration-300 ease-out",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
            WIDTHS[width],
            className
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-lg leading-tight font-semibold">
                {title}
              </DialogPrimitive.Title>
              {subtitle && (
                <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                  {subtitle}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer && (
            <footer className="bg-muted/40 flex items-center gap-2 border-t px-6 py-4">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
