'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Send, Mic, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { AIMarkdownMessage } from '@/components/ai-markdown-message'

interface Message {
	role: 'user' | 'assistant'
	content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
	isStreaming?: boolean
}

interface AIChatDialogProps {
	isOpen: boolean
	onClose: () => void
}

// 将图片文件转换为 base64
const fileToBase64 = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(file)
	})
}

export default function AIChatDialog({ isOpen, onClose }: AIChatDialogProps) {
	const [messages, setMessages] = useState<Message[]>([])
	const [input, setInput] = useState('')
	const [imageBase64, setImageBase64] = useState('')
	const [imagePreview, setImagePreview] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [isRecording, setIsRecording] = useState(false)
	const [recognition, setRecognition] = useState<any>(null)
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	// 建议问题
	const suggestedQuestions = ['介绍一下这个网站', '作者的技术栈有哪些？', '这个网站有什么特色功能？', '如何联系作者？']

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}

	useEffect(() => {
		scrollToBottom()
	}, [messages])

	// 初始化语音识别
	useEffect(() => {
		if (typeof window === 'undefined') return

		// 检查浏览器是否支持语音识别
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

		if (!SpeechRecognition) {
			console.log('浏览器不支持语音识别')
			return
		}

		const recognitionInstance = new SpeechRecognition()
		recognitionInstance.continuous = false
		recognitionInstance.interimResults = true
		recognitionInstance.lang = 'zh-CN'

		// 处理语音识别结果
		recognitionInstance.onresult = (event: any) => {
			const transcript = Array.from(event.results)
				.map((result: any) => result[0])
				.map((result: any) => result.transcript)
				.join('')

			setInput(transcript)
		}

		// 语音识别结束
		recognitionInstance.onend = () => {
			setIsRecording(false)
		}

		// 语音识别错误
		recognitionInstance.onerror = (event: any) => {
			console.error('语音识别错误:', event.error)
			setIsRecording(false)
			if (event.error === 'no-speech') {
				toast.error('未检测到语音，请重试')
			} else if (event.error === 'not-allowed') {
				toast.error('请允许使用麦克风')
			} else {
				toast.error('语音识别失败')
			}
		}

		setRecognition(recognitionInstance)

		return () => {
			if (recognitionInstance) {
				recognitionInstance.stop()
			}
		}
	}, [])

	// 快速发送建议问题
	const handleQuickQuestion = (question: string) => {
		setInput(question)
		textareaRef.current?.focus()
	}

	// 切换语音录制
	const toggleVoiceRecording = () => {
		if (!recognition) {
			toast.error('您的浏览器不支持语音识别')
			return
		}

		if (isRecording) {
			recognition.stop()
			setIsRecording(false)
		} else {
			try {
				recognition.start()
				setIsRecording(true)
				toast.info('开始语音识别...')
			} catch (error) {
				console.error('启动语音识别失败:', error)
				toast.error('启动语音识别失败')
			}
		}
	}

	// 压缩图片
	const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.8): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = e => {
				const img = new Image()
				img.onload = () => {
					const canvas = document.createElement('canvas')
					let width = img.width
					let height = img.height

					// 按比例缩放
					if (width > maxWidth) {
						height = (height * maxWidth) / width
						width = maxWidth
					}

					canvas.width = width
					canvas.height = height

					const ctx = canvas.getContext('2d')
					if (!ctx) {
						reject(new Error('无法获取 canvas context'))
						return
					}

					ctx.drawImage(img, 0, 0, width, height)

					// 转换为 base64，使用 JPEG 格式压缩
					const compressed = canvas.toDataURL('image/jpeg', quality)
					resolve(compressed)
				}
				img.onerror = reject
				img.src = e.target?.result as string
			}
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
	}

	const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		// 检查文件类型
		if (!file.type.startsWith('image/')) {
			toast.error('请上传图片文件')
			return
		}

		// 检查文件大小（限制 5MB）
		if (file.size > 5 * 1024 * 1024) {
			toast.error('图片大小不能超过 5MB')
			return
		}

		try {
			toast.info('正在压缩图片...')
			// 压缩图片到 800px 宽度，质量 0.7
			const compressed = await compressImage(file, 800, 0.7)

			// 检查压缩后的大小
			const compressedSize = (compressed.length * 0.75) / 1024 // 估算 KB
			console.log(`图片压缩: ${(file.size / 1024).toFixed(1)}KB -> ${compressedSize.toFixed(1)}KB`)

			setImageBase64(compressed)
			setImagePreview(compressed)
			toast.success('图片上传成功')
		} catch (error) {
			console.error('Image upload error:', error)
			toast.error('图片上传失败')
		}
	}

	const handleRemoveImage = () => {
		setImageBase64('')
		setImagePreview('')
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	const handleSend = async () => {
		if (!input.trim() && !imageBase64) {
			toast.error('请输入消息或上传图片')
			return
		}

		// 构建用户消息
		const userMessage: Message = {
			role: 'user',
			content: []
		}

		if (imageBase64) {
			;(userMessage.content as any[]).push({
				type: 'image_url',
				image_url: { url: imageBase64 }
			})
		}

		if (input.trim()) {
			;(userMessage.content as any[]).push({
				type: 'text',
				text: input.trim()
			})
		}

		const newMessages = [...messages, userMessage]
		setMessages(newMessages)
		setInput('')
		setImageBase64('')
		setImagePreview('')
		setIsLoading(true)

		try {
			const response = await fetch('/api/ai-chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					messages: newMessages
				})
			})

			if (!response.ok) {
				const error = await response.json()

				// 处理速率限制错误
				if (response.status === 429) {
					const retryAfter = error.retryAfter || 60
					throw new Error(`${error.error || '请求过于频繁'}，请 ${retryAfter} 秒后再试`)
				}

				// 处理来源验证错误
				if (response.status === 403) {
					throw new Error('请求被拒绝，请刷新页面后重试')
				}

				throw new Error(error.error || '请求失败')
			}

			// 处理流式响应
			const reader = response.body?.getReader()
			const decoder = new TextDecoder()
			let assistantMessage = ''
			let sseBuffer = ''
			const assistantIndex = newMessages.length

			// 添加空的助手消息
			setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

			const updateAssistantMessage = (content: string, isStreaming: boolean) => {
				setMessages(prev => {
					const newMsgs = [...prev]
					newMsgs[assistantIndex] = {
						role: 'assistant',
						content,
						isStreaming
					}
					return newMsgs
				})
			}

			const processSseLine = (line: string) => {
				if (!line.startsWith('data: ')) return

				const data = line.slice(6).trim()
				if (!data || data === '[DONE]') return

				try {
					const parsed = JSON.parse(data)
					const content = parsed.choices?.[0]?.delta?.content
					if (content) {
						assistantMessage += content
						updateAssistantMessage(assistantMessage, true)
					}
				} catch (e) {
					console.warn('忽略无效 SSE 数据:', e)
				}
			}

			if (reader) {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					sseBuffer += decoder.decode(value, { stream: true })
					const lines = sseBuffer.split('\n')
					sseBuffer = lines.pop() || ''

					for (const line of lines) {
						processSseLine(line.trimEnd())
					}
				}

				sseBuffer += decoder.decode()
				if (sseBuffer.trim()) {
					processSseLine(sseBuffer.trimEnd())
				}
			}

			updateAssistantMessage(assistantMessage, false)
		} catch (error: any) {
			console.error('AI Chat Error:', error)
			toast.error(error.message || '发送失败，请稍后重试')
			// 移除失败的消息
			setMessages(prev => prev.slice(0, -1))
		} finally {
			setIsLoading(false)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSend()
		}
	}

	const renderMessageContent = (msg: Message) => {
		const { content } = msg

		if (msg.role === 'assistant' && typeof content === 'string') {
			return <AIMarkdownMessage content={content} isStreaming={msg.isStreaming} />
		}

		if (typeof content === 'string') {
			return <p className='whitespace-pre-wrap'>{content}</p>
		}

		return (
			<div className='space-y-2'>
				{content.map((item, index) => {
					if (item.type === 'text') {
						return (
							<p key={index} className='whitespace-pre-wrap'>
								{item.text}
							</p>
						)
					}
					if (item.type === 'image_url' && item.image_url) {
						return <img key={index} src={item.image_url.url} alt='用户上传' className='max-w-xs rounded-lg' />
					}
					return null
				})}
			</div>
		)
	}

	return (
		<AnimatePresence>
			{isOpen && (
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
						className='card-rounded bg-card fixed top-1/2 left-1/2 z-[51] flex h-[600px] w-[700px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col border shadow-2xl backdrop-blur-sm max-sm:h-[80vh] max-sm:w-[95vw]'>
						{/* 头部 */}
						<div className='flex items-center justify-between border-b p-4'>
							<h3 className='text-lg font-semibold'>真寻</h3>
							<button onClick={onClose} className='text-secondary hover:text-primary transition-colors'>
								<X className='h-5 w-5' />
							</button>
						</div>

						{/* 消息列表 */}
						<div className='flex-1 space-y-4 overflow-y-auto p-4'>
							{messages.length === 0 && (
								<div className='text-secondary flex h-full flex-col items-center justify-center text-center'>
									<div className='space-y-4'>
										<div>
											<p className='text-lg'>你好！我是真寻的助手</p>
											<p className='mt-2 text-sm'>可以问我关于这个网站和作者的问题</p>
											<p className='mt-1 text-sm'>也可以上传图片让我帮你分析哦～</p>
										</div>

										{/* 建议问题 */}
										<div className='space-y-2'>
											<p className='text-xs'>试试这些问题：</p>
											<div className='flex flex-wrap justify-center gap-2'>
												{suggestedQuestions.map((question, index) => (
													<button
														key={index}
														onClick={() => handleQuickQuestion(question)}
														className='rounded-full border bg-white/60 px-3 py-1 text-xs transition-colors hover:bg-white/80'>
														{question}
													</button>
												))}
											</div>
										</div>
									</div>
								</div>
							)}

							{messages.map((msg, index) => (
								<div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
									<div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-brand text-white' : 'border bg-white/60'}`}>
										{renderMessageContent(msg)}
									</div>
								</div>
							))}

							<div ref={messagesEndRef} />
						</div>

						{/* 输入区域 */}
						<div className='space-y-2 border-t p-4'>
							{/* 图片预览 */}
							{imagePreview && (
								<div className='relative inline-block'>
									<img src={imagePreview} alt='预览' className='h-20 w-20 rounded-lg object-cover' />
									<button
										onClick={handleRemoveImage}
										className='absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600'>
										<X className='h-4 w-4' />
									</button>
								</div>
							)}

							{/* 工具栏 */}
							<div className='flex items-center gap-2'>
								<input ref={fileInputRef} type='file' accept='image/*' onChange={handleImageUpload} className='hidden' />
								<motion.button
									onClick={() => fileInputRef.current?.click()}
									disabled={isLoading || !!imagePreview}
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className='flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white/80 text-gray-600 transition-all hover:border-[var(--color-brand)] hover:bg-white hover:text-[var(--color-brand)] hover:shadow-sm disabled:opacity-50'
									title='上传图片'>
									<Upload className='h-5 w-5' />
								</motion.button>

								{recognition && (
									<motion.button
										onClick={toggleVoiceRecording}
										disabled={isLoading}
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${
											isRecording
												? 'border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/30'
												: 'border-gray-200 bg-white/80 text-gray-600 hover:border-[var(--color-brand)] hover:bg-white hover:text-[var(--color-brand)] hover:shadow-sm'
										}`}
										title={isRecording ? '停止录音' : '语音输入'}>
										<motion.div animate={isRecording ? { scale: [1, 1.15, 1] } : {}} transition={{ repeat: Infinity, duration: 1.5 }}>
											{isRecording ? <Mic className='h-5 w-5' /> : <Mic className='h-5 w-5' />}
										</motion.div>
									</motion.button>
								)}

								<span className='text-secondary flex-1 text-xs'>{imagePreview ? '已选择图片' : ''}</span>
							</div>

							{/* 文本输入和发送 */}
							<div className='flex items-stretch gap-2'>
								<textarea
									ref={textareaRef}
									value={input}
									onChange={e => setInput(e.target.value)}
									onKeyDown={handleKeyDown}
									placeholder={isRecording ? '正在识别语音...' : '输入消息... (Shift+Enter 换行)'}
									rows={2}
									disabled={isLoading || isRecording}
									className='flex-1 resize-none rounded-lg border bg-white/60 px-3 py-2 text-sm transition-colors focus:border-[var(--color-brand)] disabled:opacity-50'
								/>
								<motion.button
									onClick={handleSend}
									disabled={isLoading || isRecording || (!input.trim() && !imageBase64)}
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className='flex w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white shadow-[var(--color-brand)]/25 shadow-md transition-all hover:shadow-[var(--color-brand)]/35 hover:shadow-lg disabled:opacity-40 disabled:shadow-none'
									title='发送消息'>
									{isLoading ? <Loader2 className='h-5 w-5 animate-spin' /> : <Send className='h-5 w-5' />}
								</motion.button>
							</div>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	)
}
