'use client'

import { useMarkdownRender } from '@/hooks/use-markdown-render'

interface AIMarkdownMessageProps {
	content: string
	isStreaming?: boolean
}

export function AIMarkdownMessage({ content, isStreaming = false }: AIMarkdownMessageProps) {
	const { content: renderedContent, loading } = useMarkdownRender(isStreaming ? '' : content)

	if (isStreaming || loading || !renderedContent) {
		return <p className='whitespace-pre-wrap'>{content}</p>
	}

	return <div className='ai-chat-markdown prose max-w-none'>{renderedContent}</div>
}
