import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactElement, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Shared text input primitive. It renders a native input to preserve keyboard,
 * form, and accessibility behavior.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref): ReactElement {
  return <input ref={ref} {...props} />;
});

/**
 * Shared textarea primitive for multi-line editor and composer surfaces.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(props, ref): ReactElement {
  return <textarea ref={ref} {...props} />;
});

/**
 * Shared native select primitive for app dropdowns that should retain option
 * semantics and browser keyboard behavior.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(props, ref): ReactElement {
  return <select ref={ref} {...props} />;
});

export type FieldProps = LabelHTMLAttributes<HTMLLabelElement>;

/**
 * Shared labelled field wrapper. The default class matches the existing
 * renderer field styling while allowing additional surface-specific classes.
 */
export const Field = forwardRef<HTMLLabelElement, FieldProps>(function Field({ className, ...props }, ref): ReactElement {
  return <label ref={ref} className={clsx("field", className)} {...props} />;
});
