import { cloneElement, isValidElement, useId, type ReactElement } from "react";

interface Props {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

const CONTROLS = new Set(["input", "select", "textarea"]);

type ControlProps = {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function FormField({ label, error, required, children }: Props) {
  const generated = useId();
  let controlId: string | undefined;
  let content = children;

  if (
    isValidElement<ControlProps>(children) &&
    typeof children.type === "string" &&
    CONTROLS.has(children.type)
  ) {
    controlId = children.props.id ?? generated;
    content = cloneElement(children as ReactElement<ControlProps>, {
      id: controlId,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${controlId}-error` : undefined,
    });
  }

  return (
    <div>
      <label
        htmlFor={controlId}
        className="text-atlas-mist mb-1.5 block text-sm font-semibold"
      >
        {label}
        {required && <span className="text-atlas-star"> *</span>}
      </label>
      {content}
      {error && (
        <p
          id={controlId ? `${controlId}-error` : undefined}
          className="text-atlas-rose mt-1 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
