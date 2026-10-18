import { useEffect, useState } from "react";
import { CloseIcon } from "./atlas";

interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setVisible(false);
        setTimeout(onClose, 300);
      },
      type === "error" ? 8000 : 5000
    );
    return () => clearTimeout(timer);
  }, [onClose, type]);

  const error = type === "error";

  return (
    <div
      role={error ? "alert" : "status"}
      className={`bg-atlas-deep fixed top-4 right-4 z-50 max-w-sm rounded-md border px-4 py-3 transition-opacity duration-300 ${
        error ? "border-atlas-rose/60" : "border-atlas-ok/50"
      } ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-1.5 size-2 shrink-0 rounded-full ${
            error ? "bg-atlas-rose" : "bg-atlas-ok"
          }`}
        />
        <span className="text-atlas-dust flex-1 text-sm">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="text-atlas-mist hover:text-atlas-dust -mr-1 rounded p-0.5"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
