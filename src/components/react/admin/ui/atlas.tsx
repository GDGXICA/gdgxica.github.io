import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { createPortal } from "react-dom";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ReticleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" />
    </Icon>
  );
}

export function CheckinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6 1.4 0 2.7.5 3.7 1.3M15 18l2 2 4-4.5" />
    </Icon>
  );
}

export function BadgeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M10 3v3h4V3M9 17h6" />
      <circle cx="12" cy="11.5" r="2.5" />
    </Icon>
  );
}

export function MuralIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="8" height="10" rx="1" />
      <rect x="13" y="3" width="8" height="6" rx="1" />
      <rect x="13" y="11" width="8" height="10" rx="1" />
      <rect x="3" y="15" width="8" height="6" rx="1" />
    </Icon>
  );
}

export function GameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function CornerNodes() {
  const corners = [
    "-top-[3.5px] -left-[3.5px]",
    "-top-[3.5px] -right-[3.5px]",
    "-bottom-[3.5px] -left-[3.5px]",
    "-bottom-[3.5px] -right-[3.5px]",
  ];
  return (
    <>
      {corners.map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={`border-atlas-star/70 bg-atlas-night pointer-events-none absolute size-1.5 rotate-45 border ${position}`}
        />
      ))}
    </>
  );
}

export function ChartRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`} aria-hidden="true">
      <span className="border-atlas-star/70 size-1.5 rotate-45 border" />
      <span className="bg-atlas-line h-px flex-1" />
    </div>
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end gap-4">
      <h2 className="atlas-name text-atlas-dust text-[1.375rem] leading-none">
        {children}
      </h2>
      <ChartRule className="mb-1 flex-1" />
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <p
      role="status"
      className="text-atlas-mist flex items-center gap-3 py-6 text-sm"
    >
      <ReticleIcon className="text-atlas-star size-4 animate-spin [animation-duration:2.4s]" />
      {label}
    </p>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-atlas-rose/40 bg-atlas-rose/5 text-atlas-dust flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-4 py-3 text-sm"
    >
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border-atlas-line text-atlas-dust hover:border-atlas-mist rounded-md border px-3 py-1.5 font-semibold transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-atlas-ember px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-atlas-ember-deep disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-atlas-line px-4 py-2.5 text-sm font-semibold text-atlas-dust transition-colors hover:border-atlas-mist hover:bg-atlas-deep disabled:opacity-50",
  quiet:
    "inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-atlas-mist transition-colors hover:text-atlas-dust",
};

export function HeaderActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("admin-header-actions"));
  }, []);
  return slot ? createPortal(children, slot) : null;
}

export const inputClass =
  "border-atlas-line bg-atlas-night text-atlas-dust hover:border-atlas-fog focus:border-atlas-star w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none disabled:opacity-50";
