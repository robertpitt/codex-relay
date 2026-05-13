import { forwardRef, type ButtonHTMLAttributes, type ReactElement } from "react";
import clsx from "clsx";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Shared native button primitive. It preserves caller-supplied classes so
 * existing renderer styling can move to shared controls incrementally.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { type = "button", className, ...props },
  ref
): ReactElement {
  return <button ref={ref} type={type} className={className} {...props} />;
});

/**
 * Icon-only button primitive with the renderer's standard icon-button class.
 */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(function IconButton(
  { type = "button", className, ...props },
  ref
): ReactElement {
  return <button ref={ref} type={type} className={clsx("icon-button", className)} {...props} />;
});
