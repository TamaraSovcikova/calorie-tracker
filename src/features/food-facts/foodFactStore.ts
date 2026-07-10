import { create } from 'zustand';

export interface VisibleFact {
  /** The food the fact is about - shown as the card's eyebrow label. */
  food: string;
  text: string;
}

interface FoodFactState {
  fact: VisibleFact | null;
  show: (food: string, text: string) => void;
  dismiss: () => void;
}

/** Holds the single food-fact card currently on screen (if any). */
export const useFoodFactStore = create<FoodFactState>((set) => ({
  fact: null,
  show: (food, text) => set({ fact: { food, text } }),
  dismiss: () => set({ fact: null }),
}));
