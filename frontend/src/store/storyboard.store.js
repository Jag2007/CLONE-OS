import { create } from 'zustand';

export const useStoryboardStore = create((set, get) => ({
  frames: [],
  setFrames: (frames) => set({ frames }),
  updateFrame: (id, updater) =>
    set((state) => ({
      frames: state.frames.map((frame) =>
        frame.id === id ? (typeof updater === 'function' ? updater(frame) : { ...frame, ...updater }) : frame
      ),
    })),
  clearFrames: () => set({ frames: [] }),
}));

export const useStoryboardFrames = () => useStoryboardStore((s) => s.frames);
