'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { useMarkdownRender } from '@/hooks/use-markdown-render'
import { useSize } from '@/hooks/use-size'
import { INIT_DELAY } from '@/consts'
import type { Project } from '../components/project-card'
import projectsList from '../list.json'

export default function ProjectDetailPage() {
	const params = useParams() as { id?: string | string[] }
	const projectName = Array.isArray(params?.id) ? decodeURIComponent(params.id[0]) : decodeURIComponent(params?.id || '')
	const router = useRouter()
	const { maxSM: isMobile } = useSize()

	const [project, setProject] = useState<Project | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const found = (projectsList as Project[]).find(p => p.name === projectName)
		if (found) {
			setProject(found)
		}
		setLoading(false)
	}, [projectName])

	const { content, loading: renderLoading } = useMarkdownRender(project?.detailMarkdown || '')

	const handleBack = () => {
		router.push('/projects')
	}

	if (loading) {
		return <div className='text-secondary flex h-full items-center justify-center text-sm'>加载中...</div>
	}

	if (!project) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-4'>
				<div className='text-secondary text-sm'>项目不存在</div>
				<button onClick={handleBack} className='brand-btn px-6'>
					返回项目列表
				</button>
			</div>
		)
	}

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

	return (
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

				{/* 详情图片 */}
				{project.detailImages && project.detailImages.length > 0 && (
					<div className='mb-8'>
						<h2 className='mb-4 text-xl font-semibold'>项目截图</h2>
						<div className='grid grid-cols-1 gap-4'>
							{project.detailImages.map((img, index) => (
								<img
									key={index}
									src={img}
									alt={`${project.name} 截图 ${index + 1}`}
									className='w-full rounded-lg border'
								/>
							))}
						</div>
					</div>
				)}

				{/* Markdown 文档 */}
				{project.detailMarkdown && (
					<div>
						<h2 className='mb-4 text-xl font-semibold'>项目文档</h2>
						{renderLoading ? (
							<div className='text-secondary text-sm'>渲染中...</div>
						) : (
							<div className='prose max-w-none'>{content}</div>
						)}
					</div>
				)}
			</motion.article>

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
	)
}
