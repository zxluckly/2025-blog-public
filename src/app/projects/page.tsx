'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { MessageSquare } from 'lucide-react'
import { ProjectCard, type Project } from './components/project-card'
import CreateDialog from './components/create-dialog'
import AIChatDialog from '@/components/ai-chat-dialog'
import { pushProjects } from './services/push-projects'
import { useAuthStore } from '@/hooks/use-auth'
import { useSize } from '@/hooks/use-size'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { useMusicStore } from '@/stores/music-store'
import { useAIChatStore } from '@/stores/ai-chat-store'
import initialList from './list.json'
import type { ImageItem } from './components/image-upload-dialog'

export default function Page() {
	const [projects, setProjects] = useState<Project[]>(initialList as Project[])
	const [originalProjects, setOriginalProjects] = useState<Project[]>(initialList as Project[])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [editingProject, setEditingProject] = useState<Project | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const { isOpen: isAIChatOpen, open: openAIChat, close: closeAIChat } = useAIChatStore()
	const [imageItems, setImageItems] = useState<Map<string, ImageItem>>(new Map())
	const [detailImageFiles, setDetailImageFiles] = useState<Map<string, File[]>>(new Map())
	const keyInputRef = useRef<HTMLInputElement>(null)

	const { isAuth, setPrivateKey } = useAuthStore()
	const { maxSM, init } = useSize()
	const { cardStyles, siteContent } = useConfigStore()
	const { isPlaying: isMusicPlaying } = useMusicStore()
	const hideEditButton = siteContent.hideEditButton ?? false
	const isMusicDockVisible = init && !maxSM && cardStyles.musicCard?.enabled !== false && isMusicPlaying
	const aiBottom = isMusicDockVisible ? '120px' : '32px'

	const handleUpdate = (updatedProject: Project, oldProject: Project, imageItem?: ImageItem, detailFiles?: File[]) => {
		setProjects(prev => prev.map(p => (p.name === oldProject.name ? updatedProject : p)))
		if (imageItem) {
			setImageItems(prev => {
				const newMap = new Map(prev)
				newMap.set(updatedProject.name, imageItem)
				return newMap
			})
		}
		if (detailFiles && detailFiles.length > 0) {
			setDetailImageFiles(prev => {
				const newMap = new Map(prev)
				newMap.set(updatedProject.name, detailFiles)
				return newMap
			})
		}
	}

	const handleAdd = () => {
		setEditingProject(null)
		setIsCreateDialogOpen(true)
	}

	const handleSaveProject = (updatedProject: Project, imageItem?: ImageItem) => {
		if (editingProject) {
			const updated = projects.map(p => (p.url === editingProject.url ? updatedProject : p))
			setProjects(updated)
		} else {
			setProjects([...projects, updatedProject])
		}

		if (imageItem) {
			setImageItems(prev => {
				const newMap = new Map(prev)
				if (editingProject?.name && editingProject.name !== updatedProject.name) {
					newMap.delete(editingProject.name)
				}
				newMap.set(updatedProject.name, imageItem)
				return newMap
			})
		}
	}

	const handleDelete = (project: Project) => {
		if (confirm(`确定要删除 ${project.name} 吗？`)) {
			setProjects(projects.filter(p => p.url !== project.url))
		}
	}

	const handleChoosePrivateKey = async (file: File) => {
		try {
			const text = await file.text()
			setPrivateKey(text)
			await handleSave()
		} catch (error) {
			console.error('Failed to read private key:', error)
			toast.error('读取密钥文件失败')
		}
	}

	const handleSaveClick = () => {
		if (!isAuth) {
			keyInputRef.current?.click()
		} else {
			handleSave()
		}
	}

	const handleSave = async () => {
		setIsSaving(true)

		try {
			await pushProjects({
				projects,
				imageItems,
				detailImageFiles
			})

			setOriginalProjects(projects)
			setImageItems(new Map())
			setDetailImageFiles(new Map())
			setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: any) {
			console.error('Failed to save:', error)
			toast.error(`保存失败: ${error?.message || '未知错误'}`)
		} finally {
			setIsSaving(false)
		}
	}

	const handleCancel = () => {
		setProjects(originalProjects)
		setImageItems(new Map())
		setDetailImageFiles(new Map())
		setIsEditMode(false)
	}

	const buttonText = isAuth ? '保存' : '导入密钥'

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isEditMode && (e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault()
				setIsEditMode(true)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isEditMode])

	return (
		<>
			<input
				ref={keyInputRef}
				type='file'
				accept='.pem'
				className='hidden'
				onChange={async e => {
					const f = e.target.files?.[0]
					if (f) await handleChoosePrivateKey(f)
					if (e.currentTarget) e.currentTarget.value = ''
				}}
			/>

			<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12'>
				<div className='grid w-full max-w-[1200px] grid-cols-2 gap-6 max-md:grid-cols-1'>
					{projects.map((project, index) => (
						<ProjectCard key={project.name || index} project={project} isEditMode={isEditMode} onUpdate={handleUpdate} onDelete={() => handleDelete(project)} />
					))}
				</div>
			</div>

			<motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
				{isEditMode ? (
					<>
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleCancel}
							disabled={isSaving}
							className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							取消
						</motion.button>
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleAdd}
							className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							添加
						</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSaveClick} disabled={isSaving} className='brand-btn px-6'>
							{isSaving ? '保存中...' : buttonText}
						</motion.button>
					</>
				) : (
					!hideEditButton && (
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={() => setIsEditMode(true)}
							className='bg-card rounded-xl border px-6 py-2 text-sm backdrop-blur-sm transition-colors hover:bg-white/80'>
							编辑
						</motion.button>
					)
				)}
			</motion.div>

			{/* AI 对话按钮 */}
			<motion.button
				initial={{ opacity: 0, scale: 0 }}
				animate={{
					opacity: 1,
					scale: 1,
					bottom: aiBottom
				}}
				transition={{ delay: 0.5 }}
				whileHover={{ scale: 1.1 }}
				whileTap={{ scale: 0.9 }}
				onClick={openAIChat}
				className='bg-brand fixed right-8 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-shadow hover:shadow-xl max-sm:right-6 max-sm:h-12 max-sm:w-12'
				style={{
					bottom: aiBottom
				}}>
				<MessageSquare className='h-6 w-6 max-sm:h-5 max-sm:w-5' />
			</motion.button>

			{isCreateDialogOpen && <CreateDialog project={editingProject} onClose={() => setIsCreateDialogOpen(false)} onSave={handleSaveProject} />}
			<AIChatDialog isOpen={isAIChatOpen} onClose={closeAIChat} />
		</>
	)
}
