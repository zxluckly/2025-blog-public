'use client'

import { useMarkdownRender } from '@/hooks/use-markdown-render'

interface AIMarkdownMessageProps {
	content: string
	isStreaming?: boolean
}

export function AIMarkdownMessage({ content, isStreaming = false }: AIMarkdownMessageProps) {
	const { content: renderedContent, loading } = useMarkdownRender(content)

	// 如果正在加载且内容为空，显示占位符
	if (loading && !content) {
		return <div className='ai-chat-markdown prose max-w-none opacity-50'>加载中...</div>
	}

	// 如果有渲染内容，显示渲染后的内容
	if (renderedContent) {
		return (
			<div className='ai-chat-markdown prose max-w-none relative'>
				{renderedContent}
				{isStreaming && (
					<span className='inline-block w-2 h-4 ml-1 bg-current animate-pulse align-middle' />
				)}
			</div>
		)
	}

	// 降级到纯文本（包含流式光标）
	return (
		<p className='whitespace-pre-wrap'>
			{content}
			{isStreaming && (
				<span className='inline-block w-2 h-4 ml-1 bg-current animate-pulse align-middle' />
			)}
		</p>
	)
}
