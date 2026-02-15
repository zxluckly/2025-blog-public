'use client'

import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { MessageCircle, X } from 'lucide-react'

interface Message {
	id: string
	nickname: string
	content: string
	timestamp: string
	color: string
	x: number
	y: number
	scale?: number
}

const COLORS = [
	'#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
	'#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
	'#FCC841', '#DFEFFC', '#DEDE92', '#DE4331', '#FE9750', 
]

// 格式化时间函数
const formatDate = (dateString: string) => {
	const date = new Date(dateString)
	const now = new Date()
	const diff = now.getTime() - date.getTime()
	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return '刚刚'
	if (minutes < 60) return `${minutes}分钟前`
	if (hours < 24) return `${hours}小时前`
	if (days < 7) return `${days}天前`
	return date.toLocaleDateString('zh-CN')
}

// 抽离为单独组件，使用 memo 防止其他卡片不必要的重渲染
const MessageCard = memo(({ 
	message, 
	containerRef
}: { 
	message: Message
	containerRef: React.RefObject<HTMLDivElement | null>
}) => {
	// 随机参数只计算一次，不需要放在 state 里
	const randomParams = useRef({
		floatX: Math.random() * 20 - 10,
		floatY: Math.random() * 20 - 10,
		duration1: 4 + Math.random() * 4,
		duration2: 5 + Math.random() * 4,
		delay: Math.random() * 2
	}).current

	const baseScale = message.scale || 1

	return (
		<motion.div
			drag
			dragConstraints={containerRef}
			dragMomentum={false}
			dragElastic={0.2}
			initial={{ opacity: 0, scale: 0 }}
			animate={{ 
				opacity: 1, 
				scale: baseScale
			}}
			exit={{ opacity: 0, scale: 0 }}
			transition={{
				duration: 0.5,
				delay: randomParams.delay
			}}
			style={{
				position: 'absolute',
				left: `${message.x}%`,
				top: `${message.y}%`,
				zIndex: 10,
				touchAction: 'none'
			}}
			whileDrag={{ zIndex: 100, scale: baseScale * 1.1 }}
			whileHover={{ zIndex: 50, scale: baseScale * 1.15 }}
			className='pointer-events-auto cursor-grab active:cursor-grabbing'
		>
			{/* 内层：负责漂浮动画和视觉样式 */}
			<motion.div
				animate={{
					x: [0, randomParams.floatX, 0],
					y: [0, randomParams.floatY, 0],
				}}
				transition={{
					x: {
						duration: randomParams.duration1,
						repeat: Infinity,
						repeatType: 'reverse',
						ease: 'easeInOut',
					},
					y: {
						duration: randomParams.duration2,
						repeat: Infinity,
						repeatType: 'reverse',
						ease: 'easeInOut',
					}
				}}
				style={{
					backgroundColor: message.color,
					fontSize: `${0.875 * baseScale}rem`,
					maxWidth: '320px'
				}}
				className='max-w-xs rounded-2xl px-4 py-3 text-white shadow-lg max-sm:max-w-[200px] max-sm:rounded-xl max-sm:px-3 max-sm:py-2'
			>
				<div className='mb-1 flex items-center justify-between gap-2 max-sm:mb-0.5 max-sm:gap-1'>
					<span className='font-medium max-sm:text-xs' style={{ fontSize: '1em' }}>
						{message.nickname}
					</span>
					<span className='opacity-80 max-sm:text-[10px]' style={{ fontSize: '0.85em' }}>
						{formatDate(message.timestamp)}
					</span>
				</div>
				<p className='leading-relaxed opacity-95 max-sm:text-xs max-sm:leading-snug' style={{ fontSize: '1em' }}>
					{message.content}
				</p>
			</motion.div>
		</motion.div>
	)
})

// 添加 display name 便于调试
MessageCard.displayName = 'MessageCard'

export default function GuestbookPage() {
	const [messages, setMessages] = useState<Message[]>([])
	const [nickname, setNickname] = useState('')
	const [content, setContent] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isFormOpen, setIsFormOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// 生成随机位置和大小，确保美观
	// 留言少时集中在中心，多时扩散到全屏
	// 修改 generateRandomPosition 函数
	const generateRandomPosition = (totalMessages: number, existingMessages: Message[] = []) => {
		// 1. 检测是否为移动端 (假设 640px 为断点)
		const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

		// 2. 根据设备调整参数
		// PC端：中心 50，移动端：中心 25 (因为left是从左边开始算的，25%的位置+50%的宽度=75%，视觉上刚好居中)
		let centerX = isMobile ? 25 : 50 
		let centerY = 50 
		
		// 初始范围调整
		let rangeX = isMobile ? 15 : 20
		let rangeY = isMobile ? 35 : 20 // 移动端垂直方向可以拉长一些
		
		if (totalMessages <= 5) {
			rangeX = isMobile ? 10 : 25
			rangeY = 20
		} else if (totalMessages <= 10) {
			rangeX = isMobile ? 15 : 35
			rangeY = 30
		} else if (totalMessages <= 20) {
			rangeX = isMobile ? 20 : 45
			rangeY = 40
		} else {
			// 20+条
			// 移动端 rangeX 设为 20，意味着分布在 25 ± 20 (即 5% 到 45%)
			// 这样留给卡片本身的宽度空间就是 55%~95%，不会溢出
			rangeX = isMobile ? 20 : 48
			rangeY = 47
			centerX = isMobile ? 25 : 50
		}
		
		let attempts = 0
		const maxAttempts = 50
		
		// 计算边界
		// 移动端最大允许 X 设为 50 (预留50%给卡片宽度)，PC端设为 90
		const maxAllowableX = isMobile ? 50 : 90
		
		while (attempts < maxAttempts) {
			const x = centerX + (Math.random() * 2 - 1) * rangeX
			const y = centerY + (Math.random() * 2 - 1) * rangeY
			
			// 限制边界
			const finalX = Math.max(2, Math.min(maxAllowableX, x))
			const finalY = Math.max(10, Math.min(85, y))
			
			if (checkOverlap(finalX, finalY, existingMessages)) {
				return { x: finalX, y: finalY }
			}
			
			attempts++
		}
		
		// 兜底逻辑
		const x = centerX + (Math.random() * 2 - 1) * rangeX
		const y = centerY + (Math.random() * 2 - 1) * rangeY
		return { 
			x: Math.max(2, Math.min(maxAllowableX, x)), 
			y: Math.max(10, Math.min(85, y)) 
		}
	}

	// 检查重叠是否小于50%
	// 修改 checkOverlap 函数
	const checkOverlap = (x: number, y: number, existingMessages: Message[]) => {
		const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

		// 动态调整卡片占用的屏幕百分比
		// PC: 宽12% 高8%
		// Mobile: 宽55% 高15% (根据 max-w-[200px] 和屏幕宽度估算)
		const cardWidth = isMobile ? 55 : 12
		const cardHeight = isMobile ? 15 : 8
		
		for (const msg of existingMessages) {
			const overlapX = Math.max(0, Math.min(x + cardWidth, msg.x + cardWidth) - Math.max(x, msg.x))
			const overlapY = Math.max(0, Math.min(y + cardHeight, msg.y + cardHeight) - Math.max(y, msg.y))
			const overlapArea = overlapX * overlapY
			
			const cardArea = cardWidth * cardHeight
			const overlapPercentage = overlapArea / cardArea
			
			// 稍微放宽重叠限制，避免找不到位置
			if (overlapPercentage > 0.5) {
				return false
			}
		}
		
		return true
	}

	const generateRandomScale = () => {
		// 随机缩放：0.85 到 1.15 之间
		return 0.85 + Math.random() * 0.3
	}

	// 加载留言
	useEffect(() => {
		fetch('/api/guestbook')
			.then(res => res.json())
			.then((data: Message[]) => {
				// 为每条留言生成随机位置和大小
				const messagesWithPosition: Message[] = []
				
				data.forEach((msg) => {
					const pos = generateRandomPosition(data.length, messagesWithPosition)
					messagesWithPosition.push({
						...msg,
						x: pos.x,
						y: pos.y,
						scale: generateRandomScale()
					})
				})
				
				setMessages(messagesWithPosition)
			})
			.catch(console.error)

		// 从 localStorage 读取昵称
		const savedNickname = localStorage.getItem('guestbook_nickname')
		if (savedNickname) {
			setNickname(savedNickname)
		}
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!nickname.trim()) {
			toast.error('请输入昵称')
			return
		}

		if (!content.trim()) {
			toast.error('请输入留言内容')
			return
		}

		if (content.length > 100) {
			toast.error('留言内容不能超过100字')
			return
		}

		setIsSubmitting(true)

		try {
			const pos = generateRandomPosition(messages.length + 1)
			const newMessage: Message = {
				id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
				nickname: nickname.trim(),
				content: content.trim(),
				timestamp: new Date().toISOString(),
				color: COLORS[Math.floor(Math.random() * COLORS.length)],
				x: pos.x,
				y: pos.y,
				scale: generateRandomScale()
			}

			const response = await fetch('/api/guestbook', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newMessage)
			})

			if (!response.ok) {
				throw new Error('提交失败')
			}

			setMessages(prev => [...prev, newMessage])
			setContent('')
			setIsFormOpen(false)
			localStorage.setItem('guestbook_nickname', nickname.trim())
			toast.success('留言成功！')
		} catch (error) {
			console.error('Failed to submit message:', error)
			toast.error('留言失败，请稍后重试')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div className='relative min-h-screen overflow-hidden p-8 max-sm:p-4 max-sm:pt-20'>
			{/* 标题 */}
			<div className='relative z-10 mx-auto max-w-2xl'>
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					className='mb-8 text-center max-sm:mb-6'
				>
					<h1 className='mb-2 text-4xl font-bold max-sm:text-3xl'>留言板</h1>
					<p className='text-secondary text-sm max-sm:text-xs'>
						在这里留下你的足迹吧 ✨
					</p>
					<p className='text-secondary mt-2 text-xs'>
						共 {messages.length} 条留言
					</p>
				</motion.div>
			</div>

			{/* 悬浮留言标签 */}
			<div ref={containerRef} className='pointer-events-none absolute inset-0 overflow-hidden'>
				<AnimatePresence>
					{messages.map((message) => (
						<MessageCard
							key={message.id}
							message={message}
							containerRef={containerRef}
						/>
					))}
				</AnimatePresence>
			</div>

			{/* 左下角悬浮按钮 */}
			<motion.button
				initial={{ opacity: 0, scale: 0 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ delay: 0.5 }}
				whileHover={{ scale: 1.1 }}
				whileTap={{ scale: 0.9 }}
				onClick={() => setIsFormOpen(true)}
				className='bg-brand fixed bottom-8 left-8 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-shadow hover:shadow-xl max-sm:bottom-6 max-sm:left-6 max-sm:h-12 max-sm:w-12'
			>
				<MessageCircle className='h-6 w-6 max-sm:h-5 max-sm:w-5' />
			</motion.button>

			{/* 留言表单弹窗 */}
			<AnimatePresence>
				{isFormOpen && (
					<>
						{/* 背景遮罩 */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setIsFormOpen(false)}
							className='fixed inset-0 z-50 bg-black/20 backdrop-blur-sm'
						/>

						{/* 表单卡片 */}
						<motion.div
							initial={{ opacity: 0, scale: 0.9, y: 20 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.9, y: 20 }}
							className='card-rounded bg-card fixed bottom-24 left-8 z-50 w-96 max-w-[calc(100vw-4rem)] border p-6 shadow-2xl backdrop-blur-sm max-sm:bottom-20 max-sm:left-4 max-sm:right-4 max-sm:w-auto max-sm:p-4'
						>
							<div className='mb-4 flex items-center justify-between'>
								<h3 className='text-lg font-semibold max-sm:text-base'>写下你的留言</h3>
								<button
									onClick={() => setIsFormOpen(false)}
									className='text-secondary hover:text-primary transition-colors'
								>
									<X className='h-5 w-5 max-sm:h-4 max-sm:w-4' />
								</button>
							</div>

							<form onSubmit={handleSubmit}>
								<div className='mb-4'>
									<label className='mb-2 block text-sm font-medium max-sm:text-xs'>
										昵称
									</label>
									<input
										type='text'
										value={nickname}
										onChange={(e) => setNickname(e.target.value)}
										placeholder='请输入你的昵称'
										maxLength={20}
										className='w-full rounded-xl border bg-white/60 px-4 py-2 text-sm transition-colors focus:border-[var(--color-brand)] max-sm:px-3 max-sm:py-1.5 max-sm:text-xs'
									/>
								</div>

								<div className='mb-4'>
									<label className='mb-2 block text-sm font-medium max-sm:text-xs'>
										留言内容
										<span className='text-secondary ml-2 text-xs'>
											({content.length}/100)
										</span>
									</label>
									<textarea
										value={content}
										onChange={(e) => setContent(e.target.value)}
										placeholder='说点什么吧...'
										maxLength={100}
										rows={4}
										className='w-full resize-none rounded-xl border bg-white/60 px-4 py-2 text-sm transition-colors focus:border-[var(--color-brand)] max-sm:px-3 max-sm:py-1.5 max-sm:text-xs max-sm:rows-3'
									/>
								</div>

								<div className='flex gap-2'>
									<motion.button
										type='button'
										onClick={() => setIsFormOpen(false)}
										whileHover={{ scale: 1.02 }}
										whileTap={{ scale: 0.98 }}
										className='flex-1 rounded-xl border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white/80 max-sm:px-3 max-sm:py-1.5 max-sm:text-xs'
									>
										取消
									</motion.button>
									<motion.button
										type='submit'
										disabled={isSubmitting}
										whileHover={{ scale: 1.02 }}
										whileTap={{ scale: 0.98 }}
										className='brand-btn flex-1 justify-center max-sm:px-3 max-sm:py-1.5 max-sm:text-xs'
									>
										{isSubmitting ? '提交中...' : '发送'}
									</motion.button>
								</div>
							</form>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</div>
	)
}
