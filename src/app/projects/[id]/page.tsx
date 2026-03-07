'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { X, ZoomIn } from 'lucide-react'
import { useMarkdownRender } from '@/hooks/use-markdown-render'
import { ScrollTopButton } from '@/components/scroll-top-button'
import { INIT_DELAY } from '@/consts'
import type { Project } from '../components/project-card'
import projectsList from '../list.json'

export default function ProjectDetailPage() {
	const params = useParams() as { id?: string | string[] }
	const projectName = Array.isArray(params?.id) ? decodeURIComponent(params.id[0]) : decodeURIComponent(params?.id || '')
	const router = useRouter()

	const [blog, setBlog] = useState<{ project: Project; markdown: string } | null>(null)
	const [loading, setLoading] = useState(true)
	const [selectedImage, setSelectedImage] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		async function run() {
			if (!projectName) return
			try {
				setLoading(true)
				const found = (projectsList as Project[]).find(p => p.name === projectName)
				
				if (!cancelled && found) {
					setBlog({
						project: found,
						markdown: found.detailMarkdown || ''
					})
				}
			} catch (e: any) {
				console.error('Failed to load project:', e)
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}
		run()
		return () => {
			cancelled = true
		}
	}, [projectName])

	const { content, loading: renderLoading } = useMarkdownRender(blog?.markdown || '')

	const handleBack = () => {
		router.push('/projects')
	}

	if (loading) {
		return <div className='text-secondary flex h-full items-center justify-center text-sm'>加载中...</div>
	}

	if (!blog) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-4'>
				<div className='text-secondary text-sm'>项目不存在</div>
				<button onClick={handleBack} className='brand-btn px-6'>
					返回项目列表
				</button>
			</div>
		)
	}

	const project = blog.project

	if (!project.detailMarkdown && !project.detailImages?.length) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-4'>
				<div className='text-secondary text-sm'>该项目暂无详情</div>
				<button onClick={handleBack} className='brand-btn px-6'>
					返回项目列表
				</button>
			</div>
		)
	}

	if (renderLoading) {
		return <div className='text-secondary flex h-full items-center justify-center text-sm'>渲染中...</div>
	}

	return (
		<>
			<div className='mx-auto flex max-w-[1140px] justify-center gap-6 px-6 pt-28 pb-12 max-sm:px-4'>
				<motion.article
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: INIT_DELAY }}
					className='card bg-article static flex-1 overflow-auto rounded-xl p-8 max-sm:p-6'>
					{/* 项目头部信息 */}
					<div className='mb-8'>
						<div className='flex items-start gap-4'>
							<img
								src={project.image}
								alt={project.name}
								className='h-20 w-20 shrink-0 rounded-xl object-cover'
							/>
							<div className='flex-1'>
								<h1 className='text-2xl font-semibold'>{project.name}</h1>
								<div className='text-secondary mt-2 text-sm'>{project.year}</div>
								<div className='mt-3 flex flex-wrap gap-2'>
									{project.tags.map(tag => (
										<span key={tag} className='text-secondary bg-card rounded-lg px-2 py-1 text-xs'>
											{tag}
										</span>
									))}
								</div>
							</div>
						</div>
						<p className='text-secondary mt-4 leading-relaxed'>{project.description}</p>
						
						{/* 链接 */}
						<div className='mt-4 flex flex-wrap gap-2'>
							{project.url && (
								<a
									href={project.url}
									target='_blank'
									rel='noopener noreferrer'
									className='bg-card hover:bg-bg rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors'>
									Website
								</a>
							)}
							{project.github && (
								<a
									href={project.github}
									target='_blank'
									rel='noopener noreferrer'
									className='bg-card hover:bg-bg rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors'>
									GitHub
								</a>
							)}
							{project.npm && (
								<a
									href={project.npm}
									target='_blank'
									rel='noopener noreferrer'
									className='bg-card hover:bg-bg rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors'>
									NPM
								</a>
							)}
						</div>
					</div>

					{/* 详情图片 - 缩略图网格 */}
					{project.detailImages && project.detailImages.length > 0 && (
						<div className='mb-8'>
							<h2 className='mb-4 text-xl font-semibold'>项目截图</h2>
							<div className='grid grid-cols-2 gap-3 max-sm:grid-cols-1'>
								{project.detailImages.map((img, index) => (
									<div
										key={index}
										className='group relative cursor-pointer overflow-hidden rounded-lg border transition-all hover:shadow-lg'
										onClick={() => setSelectedImage(img)}>
										<img
											src={img}
											alt={`${project.name} 截图 ${index + 1}`}
											className='h-48 w-full object-cover transition-transform group-hover:scale-105'
										/>
										<div className='absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
											<ZoomIn className='h-8 w-8 text-white' />
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Markdown 文档 */}
					{blog.markdown && (
						<div>
							<h2 className='mb-4 text-xl font-semibold'>项目文档</h2>
							<div className='prose max-w-none'>{content}</div>
						</div>
					)}
				</motion.article>

				{/* 侧边栏 - 回到顶部按钮 */}
				<div className='sticky flex w-[200px] shrink-0 flex-col items-start gap-4 self-start max-sm:hidden' style={{ top: 24 }}>
					<ScrollTopButton delay={INIT_DELAY * 1000} />
				</div>

				{/* 返回按钮 */}
				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					onClick={handleBack}
					className='absolute top-4 right-6 rounded-xl border bg-white/60 px-6 py-2 text-sm backdrop-blur-sm transition-colors hover:bg-white/80 max-sm:hidden'>
					返回
				</motion.button>
			</div>

			{/* 图片查看器 */}
			<AnimatePresence>
				{selectedImage && (
					<>
						{/* 背景遮罩 */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setSelectedImage(null)}
							className='fixed inset-0 z-50 bg-black/90 backdrop-blur-sm'
						/>

						{/* 大图 */}
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							className='fixed inset-0 z-50 flex items-center justify-center p-4'>
							<button
								onClick={() => setSelectedImage(null)}
								className='absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20'>
								<X className='h-6 w-6' />
							</button>
							<img
								src={selectedImage}
								alt='预览'
								className='max-h-[90vh] max-w-[90vw] rounded-lg object-contain'
								onClick={(e) => e.stopPropagation()}
							/>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	)
}
