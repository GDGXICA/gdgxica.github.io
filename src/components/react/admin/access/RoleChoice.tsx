import type { ReactNode } from "react";
import { ReticleIcon } from "../ui/atlas";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions";

export function RoleChoice({
  legend,
  name,
  roles,
  value,
  onChange,
  note,
  disabled,
}: {
  legend: string;
  name: string;
  roles: Role[];
  value: Role;
  onChange: (role: Role) => void;
  note?: (role: Role) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-atlas-dust mb-2 text-sm font-medium">
        {legend}
      </legend>
      <div className="border-atlas-line rounded-xs border">
        {roles.map((role) => {
          const selected = value === role;
          return (
            <label
              key={role}
              className={`border-atlas-line has-focus-visible:outline-atlas-star flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-b-0 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 ${
                selected ? "bg-atlas-deep" : "hover:bg-atlas-deep/60"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={role}
                checked={selected}
                onChange={() => onChange(role)}
                className="sr-only"
              />
              <ReticleIcon
                className={`mt-0.5 size-4 shrink-0 ${
                  selected ? "text-atlas-star" : "text-atlas-line"
                }`}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span
                    className={`text-sm ${
                      selected
                        ? "text-atlas-dust font-semibold"
                        : "text-atlas-mist"
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </span>
                  {note?.(role)}
                </span>
                <span className="text-atlas-fog mt-0.5 block text-sm leading-snug">
                  {ROLE_DESCRIPTIONS[role]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
