import { useEffect, useState } from "react";

const WAKE_EVENTS = ["pointermove", "pointerdown", "keydown"] as const;

export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    for (const name of WAKE_EVENTS) window.addEventListener(name, wake);
    return () => {
      window.clearTimeout(timer);
      for (const name of WAKE_EVENTS) window.removeEventListener(name, wake);
    };
  }, [ms]);

  return idle;
}
