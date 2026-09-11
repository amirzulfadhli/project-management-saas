"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface WikiDraft {
  selectedId: string | null;
  mode: "edit" | "create";
  createParentId: string | null;
  title: string;
  content: string;
  dirty: boolean;
}
const WikiDraftContext = createContext<Map<string, WikiDraft> | null>(null);

/** Session-memory only: survives section navigation, never persisted to browser storage. */
export function WikiDraftProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, WikiDraft>());
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (![...drafts.values()].some((draft) => draft.dirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  return (
    <WikiDraftContext.Provider value={drafts}>
      {children}
    </WikiDraftContext.Provider>
  );
}

export function useWikiDrafts() {
  const drafts = useContext(WikiDraftContext);
  if (!drafts) throw new Error("WikiDraftProvider is missing");
  return drafts;
}
