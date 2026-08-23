'use client'

import { create } from 'zustand'

interface AIChatStore {
	isOpen: boolean
	setIsOpen: (isOpen: boolean) => void
	open: () => void
	close: () => void
}

export const useAIChatStore = create<AIChatStore>(set => ({
	isOpen: false,
	setIsOpen: isOpen => set({ isOpen }),
	open: () => set({ isOpen: true }),
	close: () => set({ isOpen: false })
}))
