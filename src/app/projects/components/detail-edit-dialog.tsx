'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X, Upload, Link as LinkIcon, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { Project } from './project-card'

interface DetailEditDialogProps {
	project: Project
	onClose: () => void
	onSave: (detailImages: string[], detailMarkdown: string, imageFiles: File[]) => void
}

type LocalImageItem = {
	previewUrl: string
	file: File
}

export default function DetailEditDialog({ project, onClose, onSave }: DetailEditDialogProps) {
	const [detailImages, setDetailImages] = useState<string[]>(project.detailImages || [])
	const [detailMarkdown, setDetailMarkdown] = useState(project.detailMarkdown || '')
	const [localImageItems, setLocalImageItems] = useState<LocalImageItem[]>([])
	const [newImageUrl, setNewImageUrl] = useState('')
	const [showUrlInput, setShowUrlInput] = useState(false)
	
	const imageInputRef = useRef<HTMLInputElement>(null)
	const mdInputRef = useRef<HTMLInputElement>(null)

	const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || [])
		if (files.length === 0) return

		// 检查文件类型和大小
		for (const file of files) {
			if (!file.type.startsWith('image/')) {
				toast.error(`${file.name} 不是图片文件`)
				continue
			}
			if (file.size > 10 * 1024 * 1024) {
				toast.error(`${file.name} 大小超过 10MB`)
				continue
			}

			// 创建预览 URL
			const previewUrl = URL.createObjectURL(file)
			setDetailImages(prev => [...prev, previewUrl])
			setLocalImageItems(prev => [...prev, { previewUrl, file }])
		}

		toast.success(`已添加 ${files.length} 张图片`)
	}

	const handleAddImageUrl = () => {
		if (!newImageUrl.trim()) {
			toast.error('请输入图片链接')
			return
		}

		// 简单验证 URL
		try {
			new URL(newImageUrl)
			setDetailImages(prev => [...prev, newImageUrl])
			setNewImageUrl('')
			setShowUrlInput(false)
			toast.success('已添加图片链接')
		} catch {
			toast.error('无效的图片链接')
		}
	}

	const handleRemoveImage = (index: number) => {
		const imageUrl = detailImages[index]

		// 如果是本地预览 URL，需要释放并移除对应的文件
		if (imageUrl.startsWith('blob:')) {
			URL.revokeObjectURL(imageUrl)
			setLocalImageItems(prev => prev.filter(item => item.previewUrl !== imageUrl))
		}

		setDetailImages(prev => prev.filter((_, i) => i !== index))
	}

	const handleMdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		if (!file.name.endsWith('.md')) {
			toast.error('请上传 .md 文件')
			return
		}

		try {
			const text = await file.text()
			setDetailMarkdown(text)
			toast.success('Markdown 文件已导入')
		} catch (error) {
			console.error('Failed to read markdown file:', error)
			toast.error('读取文件失败')
		}
	}

	const handleSave = () => {
		onSave(detailImages, detailMarkdown, localImageItems.map(item => item.file))
		onClose()
	}

	// 使用 Portal 渲染到 body，避免父元素定位影响
	if (typeof document === 'undefined') return null

	return createPortal(
		<AnimatePresence>
			<>
				{/* 背景遮罩 */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={onClose}
					className='fixed inset-0 z-50 bg-black/30 backdrop-blur-sm'
				/>

				{/* 对话框 */}
				<motion.div
					initial={{ opacity: 0, scale: 0.95, y: 20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: 20 }}
					className='card-rounded bg-card fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[800px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col border shadow-2xl backdrop-blur-sm'>
					{/* 头部 */}
					<div className='flex items-center justify-between border-b p-6'>
						<h3 className='text-lg font-semibold'>编辑项目详情</h3>
						<button
							onClick={onClose}
							className='text-secondary hover:text-primary transition-colors'>
							<X className='h-5 w-5' />
						</button>
					</div>

					{/* 内容 */}
					<div className='flex-1 overflow-y-auto p-6 space-y-6'>
						{/* 详情图片 */}
						<div>
							<label className='mb-3 block text-sm font-medium'>
								详情图片
								<span className='text-secondary ml-2 text-xs font-normal'>
									（支持上传或链接）
								</span>
							</label>

							{/* 图片列表 */}
							{detailImages.length > 0 && (
								<div className='mb-3 grid grid-cols-3 gap-3'>
									{detailImages.map((img, index) => (
										<div key={index} className='group relative'>
											<img
												src={img}
												alt={`详情图 ${index + 1}`}
												className='h-24 w-full rounded-lg object-cover'
											/>
											<button
												onClick={() => handleRemoveImage(index)}
												className='absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100'>
												<X className='h-4 w-4' />
											</button>
										</div>
									))}
								</div>
							)}

							{/* 添加按钮 */}
							<div className='flex gap-2'>
								<input
									ref={imageInputRef}
									type='file'
									accept='image/*,image/webp'
									multiple
									onChange={handleImageUpload}
									className='hidden'
								/>
								<button
									onClick={() => imageInputRef.current?.click()}
									className='flex items-center gap-2 rounded-lg border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white/80'>
									<Upload className='h-4 w-4' />
									上传图片
								</button>
								<button
									onClick={() => setShowUrlInput(!showUrlInput)}
									className='flex items-center gap-2 rounded-lg border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white/80'>
									<LinkIcon className='h-4 w-4' />
									添加链接
								</button>
							</div>

							{/* URL 输入 */}
							{showUrlInput && (
								<div className='mt-3 flex gap-2'>
									<input
										type='url'
										value={newImageUrl}
										onChange={e => setNewImageUrl(e.target.value)}
										placeholder='https://example.com/image.jpg'
										className='flex-1 rounded-lg border bg-white/60 px-3 py-2 text-sm focus:outline-none'
										onKeyDown={e => e.key === 'Enter' && handleAddImageUrl()}
									/>
									<button
										onClick={handleAddImageUrl}
										className='brand-btn px-4 text-sm'>
										添加
									</button>
								</div>
							)}
						</div>

						{/* Markdown 文档 */}
						<div>
							<label className='mb-3 block text-sm font-medium'>
								项目文档
								<span className='text-secondary ml-2 text-xs font-normal'>
									（支持 Markdown 格式）
								</span>
							</label>

							<div className='mb-3 flex gap-2'>
								<input
									ref={mdInputRef}
									type='file'
									accept='.md'
									onChange={handleMdUpload}
									className='hidden'
								/>
								<button
									onClick={() => mdInputRef.current?.click()}
									className='flex items-center gap-2 rounded-lg border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white/80'>
									<FileText className='h-4 w-4' />
									导入 .md 文件
								</button>
							</div>

							<textarea
								value={detailMarkdown}
								onChange={e => setDetailMarkdown(e.target.value)}
								placeholder='在此输入 Markdown 格式的项目文档...'
								rows={12}
								className='w-full resize-none rounded-lg border bg-white/60 px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none'
							/>
						</div>
					</div>

					{/* 底部按钮 */}
					<div className='flex gap-3 border-t p-6'>
						<button
							onClick={onClose}
							className='flex-1 rounded-lg border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white/80'>
							取消
						</button>
						<button
							onClick={handleSave}
							className='brand-btn flex-1 justify-center'>
							保存
						</button>
					</div>
				</motion.div>
			</>
		</AnimatePresence>,
		document.body
	)
}
