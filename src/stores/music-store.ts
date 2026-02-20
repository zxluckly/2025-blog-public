import { create } from 'zustand'

interface MusicStore {
	isPlaying: boolean
	setIsPlaying: (playing: boolean) => void
}

export const useMusicStore = create<MusicStore>(set => ({
	isPlaying: false,
	setIsPlaying: (playing: boolean) => set({ isPlaying: playing })
}))
