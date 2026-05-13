import { forwardRef, type LabelHTMLAttributes, type ReactElement, type SelectHTMLAttributes } from "react";
import clsx from "clsx";
import { Select } from "./Form";

export type DropdownProps = LabelHTMLAttributes<HTMLLabelElement>;

/**
 * Shared dropdown wrapper for icon-plus-select compositions.
 */
export const Dropdown = forwardRef<HTMLLabelElement, DropdownProps>(function Dropdown({ className, ...props }, ref): ReactElement {
  return <label ref={ref} className={className} {...props} />;
});

export type DropdownSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Shared select used inside dropdown compositions.
 */
export const DropdownSelect = forwardRef<HTMLSelectElement, DropdownSelectProps>(function DropdownSelect(
  { className, ...props },
  ref
): ReactElement {
  return <Select ref={ref} className={clsx(className)} {...props} />;
});
