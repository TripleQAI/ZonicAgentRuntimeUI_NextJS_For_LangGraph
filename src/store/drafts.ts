import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Unsent composer text by conversation (a session ID, or `new:<workflow>` for a new chat), kept in
 * the tab's session storage: a sign-in after an expired token, or a reload, keeps what the user
 * typed (case U-11).
 */
export interface DraftState {
  drafts: Record<string, string>;
  setDraft(key: string, text: string): void;
  clearDraft(key: string): void;
}

export const useDrafts = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (key, text) => set((state) => ({ drafts: { ...state.drafts, [key]: text } })),
      clearDraft: (key) =>
        set((state) => {
          const { [key]: _removed, ...rest } = state.drafts;
          return { drafts: rest };
        }),
    }),
    { name: 'zonic-runtime-drafts', storage: createJSONStorage(() => sessionStorage) },
  ),
);
