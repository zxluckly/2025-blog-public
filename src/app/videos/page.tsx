'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import staticVideoList from '../../../public/videos/list.json'
import PlaySVG from '@/svgs/play.svg'

interface Video {
	id: string
	title: string
	path: string
	uploadedAt: string
}

export default function VideosPage() {
	const [videos, setVideos] = useState<Video[]>(staticVideoList as Video[])
	const [playingId, setPlayingId] = useState<string | null>(null)

	// 动态加载视频列表（如果静态列表为空）
	useEffect(() => {
		if (staticVideoList.length === 0) {
			fetch('/api/videos')
				.then(res => res.json())
				.then((data: Video[]) => {
					if (data.length > 0) {
						setVideos(data)
					}
				})
				.catch(console.error)
		}
	}, [])

	const formatDate = (dateString: string) => {
		const date = new Date(dateString)
		return date.toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	}

	return (
		<div className='min-h-screen p-8'>
			<div className='mx-auto max-w-6xl'>
				<motion.h1 
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					className='mb-8 text-4xl font-bold'
				>
					视频空间
				</motion.h1>

				{videos.length === 0 ? (
					<div className='text-secondary flex min-h-[60vh] items-center justify-center text-center text-sm'>
						还没有上传视频，请将视频文件放入 public/videos 目录。
					</div>
				) : (
					<div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
						{videos.map((video, index) => (
							<motion.div
								key={video.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: index * 0.1 }}
								className='group relative overflow-hidden rounded-2xl bg-white/60 backdrop-blur-sm'
							>
								<div className='relative aspect-video w-full overflow-hidden bg-gray-100'>
									{playingId === video.id ? (
										<video
											src={video.path}
											controls
											autoPlay
											className='h-full w-full object-cover'
											onEnded={() => setPlayingId(null)}
										/>
									) : (
										<>
											<video
												src={video.path}
												className='h-full w-full object-cover'
												preload='metadata'
											/>
											<button
												onClick={() => setPlayingId(video.id)}
												className='absolute inset-0 flex items-center justify-center bg-black/20 transition-all hover:bg-black/30'
											>
												<div className='flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110'>
													<PlaySVG className='text-brand ml-5 h-4 w-8' />
												</div>
											</button>
										</>
									)}
								</div>

								<div className='p-4'>
									<h3 className='mb-2 line-clamp-2 text-lg font-medium'>
										{video.title}
									</h3>
									<p className='text-secondary text-sm'>
										{formatDate(video.uploadedAt)}
									</p>
								</div>
							</motion.div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
