"use client";

import { useEffect, useId, useRef } from "react";

let scrollLocks = 0;
let originalOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
  };
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  placement = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
  placement?: "center" | "header" | "navigation" | "task";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement;
    // Native top-layer dialogs keep background content inert, including when nested.
    dialog.showModal();
    const unlock = lockScroll();
    closeRef.current?.focus();
    return () => {
      dialog.close();
      unlock();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  const position =
    placement === "task"
      ? "inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-none rounded-none md:w-[min(64rem,calc(100vw-3rem))]"
      : placement === "navigation"
        ? "inset-y-0 left-0 right-auto m-0 h-dvh w-[min(20rem,calc(100vw-2rem))] max-h-dvh rounded-none"
        : placement === "header"
          ? "bottom-auto left-auto right-3 top-[calc(var(--header-height)+0.5rem)] m-0 w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-var(--header-height)-1.5rem)] rounded-lg"
          : `inset-0 m-auto w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1.5rem)] rounded-xl ${size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-lg"}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className={`fixed overflow-hidden border border-border bg-raised p-0 text-text-primary shadow-lg backdrop:bg-black/30 ${position}`}
      onCancel={(event) => {
        // The caller owns close/discard policy; Escape must not bypass it.
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="flex max-h-[inherit] min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <h2
            id={titleId}
            className="min-w-0 break-words text-base font-semibold"
          >
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="icon-control text-xl text-text-secondary hover:bg-hover hover:text-text-primary"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </div>
    </dialog>
  );
}
