import { useEffect, useRef } from "react";
import "./Toast.css";

interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}

// Success toasts close themselves; errors stay until dismissed so they
// can't vanish before they're read.
const SUCCESS_TIMEOUT_MS = 4000;

export default function Toast({ message, type, onClose }: ToastProps) {
  // Callers pass an inline arrow, which is a new function every render.
  // Holding it in a ref keeps the timer from restarting on each re-render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (type !== "success") return;
    const timer = setTimeout(() => onCloseRef.current(), SUCCESS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [type, message]);

  return (
    <div
      className={`toast toast--${type}`}
      role="alert"
      aria-live="polite"
    >
      <div className="toast__content">
        <span className="toast__icon">
          {type === "success" ? "✓" : "!"}
        </span>

        <p className="toast__message">{message}</p>

        <button
          className="toast__close"
          onClick={onClose}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}
