import { forwardRef, type HTMLAttributes, type ReactElement } from "react";
import clsx from "clsx";

export type PanelProps = HTMLAttributes<HTMLElement>;

/**
 * Shared panel primitive for bordered or grouped app surfaces.
 */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel({ className, ...props }, ref): ReactElement {
  return <section ref={ref} className={className} {...props} />;
});

export type CardProps = HTMLAttributes<HTMLElement>;

/**
 * Shared card primitive for repeated item containers.
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card({ className, ...props }, ref): ReactElement {
  return <article ref={ref} className={className} {...props} />;
});

/**
 * Shared modal backdrop primitive.
 */
export const DialogBackdrop = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function DialogBackdrop(
  { className, ...props },
  ref
): ReactElement {
  return <div ref={ref} className={clsx("modal-backdrop", className)} {...props} />;
});

export type DialogProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "aside";
};

/**
 * Shared dialog surface primitive. It renders the current native dialog-like
 * structure used by the Electron renderer rather than the browser dialog API.
 */
export const Dialog = forwardRef<HTMLElement, DialogProps>(function Dialog(
  { as: Component = "section", role = "dialog", "aria-modal": ariaModal = true, ...props },
  ref
): ReactElement {
  return <Component ref={ref} role={role} aria-modal={ariaModal} {...props} />;
});
