import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import projects from '@/app/projects/list.json'
import siteContent from '@/config/site-content.json'

// 使用 Edge Runtime，部署到全球边缘节点
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const ARK_API_KEY = process.env.ARK_API_KEY
const ARK_MODEL = process.env.ARK_MODEL || 'ep-20250310111028-lvbvn'
const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

type Project = {
	name: string
	year: number
	image: string
	url: string
	description: string
	tags: string[]
	github: string
	detailImages?: string[]
	detailMarkdown?: string
}

type ToolCall = {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string | Record<string, unknown>
	}
}

const projectList = projects as Project[]

// 初始化 Redis 客户端
const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
	? new Redis({
			url: process.env.KV_REST_API_URL,
			token: process.env.KV_REST_API_TOKEN,
		})
	: null

// 速率限制配置
const RATE_LIMIT = {
	PER_MINUTE: 10, // 每分钟最多 10 次请求
	PER_DAY: 100, // 每天最多 100 次请求
	MAX_MESSAGES: 20 // 单次对话最多 20 轮
}

const RATE_LIMIT_PREFIX = 'ai-chat:ratelimit:'

const AI_TOOLS = [
	{
		type: 'function',
		function: {
			name: 'get_all_projects',
			description: '获取作者项目列表。用于用户询问有哪些项目、项目总览、项目技术栈、项目 GitHub 链接时调用。返回全部项目的摘要信息，不包含 detailMarkdown 和 detailImages。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_project_detail',
			description: '按项目名称、关键词或技术栈搜索并获取指定项目详情。用于用户询问某个具体项目的详细介绍、功能、架构、技术栈、截图或 README 内容时调用。返回匹配项目的完整详情，包含 detailMarkdown 和 detailImages。',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: '用户指定的项目名称、关键词或技术栈，例如“慢性病风险预测系统”“Django”“视频库”。'
					}
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_site_content',
			description: '获取作者主页和站点配置信息。用于用户询问网站名称、网站介绍、作者主页、联系方式、社交链接、GitHub、邮箱、QQ 等信息时调用。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	}
]

function normalizeText(value: string): string {
	return value.toLowerCase().replace(/\s+/g, '')
}

function getProjectSummary(project: Project) {
	return {
		name: project.name,
		year: project.year,
		image: project.image,
		url: project.url,
		description: project.description,
		tags: project.tags,
		github: project.github
	}
}

function getAllProjects() {
	return {
		count: projectList.length,
		projects: projectList.map(getProjectSummary)
	}
}

function getProjectDetail(query: string) {
	const normalizedQuery = normalizeText(query)

	const exactMatch = projectList.find(project => normalizeText(project.name) === normalizedQuery)
	if (exactMatch) {
		return {
			found: true,
			project: exactMatch
		}
	}

	const nameMatches = projectList.filter(project => normalizeText(project.name).includes(normalizedQuery))
	if (nameMatches.length === 1) {
		return {
			found: true,
			project: nameMatches[0]
		}
	}

	const contentMatches = projectList.filter(project => {
		const searchable = normalizeText([
			project.name,
			project.description,
			project.github,
			...(project.tags || [])
		].join(' '))

		return searchable.includes(normalizedQuery)
	})

	if (contentMatches.length === 1) {
		return {
			found: true,
			project: contentMatches[0]
		}
	}

	const candidates = nameMatches.length > 0 ? nameMatches : contentMatches

	return {
		found: false,
		message: candidates.length > 0
			? '找到了多个可能匹配的项目，请让用户指定更准确的项目名称。'
			: '未找到匹配项目，请让用户换一个项目名称或关键词。',
		candidates: candidates.map(getProjectSummary),
		allProjects: projectList.map(project => ({
			name: project.name,
			year: project.year,
			tags: project.tags
		}))
	}
}

function getSiteContent() {
	return siteContent
}

function parseToolArguments(args: string | Record<string, unknown> | undefined): Record<string, unknown> {
	if (!args) return {}
	if (typeof args !== 'string') return args

	try {
		return JSON.parse(args)
	} catch {
		return {}
	}
}

function executeToolCall(toolCall: ToolCall) {
	const toolName = toolCall.function.name
	const args = parseToolArguments(toolCall.function.arguments)

	switch (toolName) {
		case 'get_all_projects':
			return getAllProjects()
		case 'get_project_detail':
			return getProjectDetail(String(args.query || ''))
		case 'get_site_content':
			return getSiteContent()
		default:
			return {
				error: `未知工具：${toolName}`
			}
	}
}

function createTextStream(content: string) {
	const encoder = new TextEncoder()

	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(`data: ${JSON.stringify({
				choices: [
					{
						delta: {
							content
						}
					}
				]
			})}\n\n`))
			controller.enqueue(encoder.encode('data: [DONE]\n\n'))
			controller.close()
		}
	})
}

function getAssistantText(message: any): string {
	const content = message?.content

	if (typeof content === 'string') return content
	if (Array.isArray(content)) {
		return content
			.filter(block => block?.type === 'text' && typeof block.text === 'string')
			.map(block => block.text)
			.join('')
	}

	return ''
}

function createStreamResponse(body: ReadableStream<Uint8Array> | null) {
	return new Response(body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	})
}

// 获取客户端标识（IP + User Agent）
function getClientId(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for')
	const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'
	const userAgent = request.headers.get('user-agent') || 'unknown'
	return `${ip}-${userAgent.slice(0, 50)}` // 限制长度避免过长
}

// 检查速率限制（使用 Redis）
async function checkRateLimit(clientId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
	// 如果 Redis 不可用，回退到宽松模式（仅做基本验证）
	if (!redis) {
		console.warn('Redis not available, rate limiting disabled')
		return { allowed: true }
	}

	const minuteKey = `${RATE_LIMIT_PREFIX}minute:${clientId}`
	const dayKey = `${RATE_LIMIT_PREFIX}day:${clientId}`

	try {
		// 检查每日限制
		const dailyCount = await redis.get<number>(dayKey) || 0
		if (dailyCount >= RATE_LIMIT.PER_DAY) {
			const ttl = await redis.ttl(dayKey)
			return { allowed: false, retryAfter: ttl > 0 ? ttl : 86400 }
		}

		// 检查每分钟限制
		const minuteCount = await redis.get<number>(minuteKey) || 0
		if (minuteCount >= RATE_LIMIT.PER_MINUTE) {
			const ttl = await redis.ttl(minuteKey)
			return { allowed: false, retryAfter: ttl > 0 ? ttl : 60 }
		}

		// 增加计数
		const pipeline = redis.pipeline()

		// 每分钟计数
		if (minuteCount === 0) {
			pipeline.set(minuteKey, 1, { ex: 60 })
		} else {
			pipeline.incr(minuteKey)
		}

		// 每日计数
		if (dailyCount === 0) {
			pipeline.set(dayKey, 1, { ex: 86400 })
		} else {
			pipeline.incr(dayKey)
		}

		await pipeline.exec()

		return { allowed: true }
	} catch (error) {
		console.error('Rate limit check error:', error)
		// Redis 错误时允许请求通过，避免服务完全不可用
		return { allowed: true }
	}
}

// 验证请求来源
function validateOrigin(request: Request): boolean {
	const origin = request.headers.get('origin')
	const referer = request.headers.get('referer')

	// 允许的域名列表
	const allowedDomains = [
		'localhost',
		'127.0.0.1',
		'zxluky.asia',
		'www.zxluky.asia',
		'zxlucky.top',
		'www.zxlucky.top'
	]

	// 检查 origin
	if (origin) {
		const originUrl = new URL(origin)
		if (allowedDomains.some(domain => originUrl.hostname.includes(domain))) {
			return true
		}
	}

	// 检查 referer
	if (referer) {
		const refererUrl = new URL(referer)
		if (allowedDomains.some(domain => refererUrl.hostname.includes(domain))) {
			return true
		}
	}

	return false
}

// 系统提示词 - 简洁版
const SYSTEM_PROMPT = `你是真寻，ZX的助手。

网站特点：技术博客，插件分享，留言板，项目展示，视频库。

作者：新人开发者，喜欢追番、游戏。
联系：QQ 3190925010，邮箱：haochenwu7@gmail.com

技术栈：
前端：Vue.js、React、TypeScript、Next.js
后端：Python、Java、Spring Boot、Node.js
数据/AI：MySQL、Redis、PyTorch、计算机视觉
工具：Git、Docker、Linux、Vercel

你可以使用工具读取项目列表、指定项目详情和作者主页配置。
用户询问项目总览、项目列表、项目技术栈、GitHub 链接时，优先调用 get_all_projects。
用户询问某个具体项目的详细介绍、功能、架构、截图或 README 内容时，优先调用 get_project_detail。
用户询问作者主页、网站信息、联系方式、社交链接时，优先调用 get_site_content。
不要编造项目和联系方式；工具没有返回的信息要如实说明。

用友好轻松的语气回答，可用颜文字。鼓励用户留言交流。`

export async function POST(request: Request) {
	try {
		// 1. 验证 API Key 配置
		if (!ARK_API_KEY) {
			console.error('ARK_API_KEY not configured')
			return NextResponse.json(
				{ error: 'ARK_API_KEY 未配置，请在环境变量中设置' },
				{ status: 500 }
			)
		}

		// 2. 验证请求来源
		if (!validateOrigin(request)) {
			console.warn('Invalid origin:', request.headers.get('origin'))
			return NextResponse.json(
				{ error: '无效的请求来源' },
				{ status: 403 }
			)
		}

		// 3. 检查速率限制
		const clientId = getClientId(request)
		const rateLimitResult = await checkRateLimit(clientId)

		if (!rateLimitResult.allowed) {
			return NextResponse.json(
				{
					error: '请求过于频繁，请稍后再试',
					retryAfter: rateLimitResult.retryAfter
				},
				{
					status: 429,
					headers: {
						'Retry-After': String(rateLimitResult.retryAfter || 60)
					}
				}
			)
		}

		// 4. 验证请求体
		const body = await request.json()
		const { messages } = body

		if (!messages || !Array.isArray(messages)) {
			return NextResponse.json(
				{ error: '无效的消息格式' },
				{ status: 400 }
			)
		}

		// 5. 限制消息数量
		if (messages.length > RATE_LIMIT.MAX_MESSAGES) {
			return NextResponse.json(
				{ error: `对话轮数超过限制（最多 ${RATE_LIMIT.MAX_MESSAGES} 轮）` },
				{ status: 400 }
			)
		}

		// 6. 在用户消息前添加系统提示词
		const messagesWithSystem = [
			{
				role: 'system',
				content: SYSTEM_PROMPT
			},
			...messages
		]

		console.log('Sending request to ARK API:', {
			model: ARK_MODEL,
			messageCount: messagesWithSystem.length,
			clientId: clientId.slice(0, 20) + '...' // 只记录部分 ID
		})

		// 7. 先发起一次非流式请求，让模型决定是否需要调用工具
		const firstResponse = await fetch(ARK_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${ARK_API_KEY}`
			},
			body: JSON.stringify({
				model: ARK_MODEL,
				messages: messagesWithSystem,
				tools: AI_TOOLS,
				tool_choice: 'auto',
				stream: false
			})
		})

		if (!firstResponse.ok) {
			const errorText = await firstResponse.text()
			console.error('ARK API Error:', {
				status: firstResponse.status,
				statusText: firstResponse.statusText,
				body: errorText
			})
			return NextResponse.json(
				{ error: `AI 服务请求失败: ${firstResponse.statusText}` },
				{ status: firstResponse.status }
			)
		}

		const firstResult = await firstResponse.json()
		const assistantMessage = firstResult.choices?.[0]?.message
		const toolCalls = assistantMessage?.tool_calls as ToolCall[] | undefined

		if (!toolCalls || toolCalls.length === 0) {
			return createStreamResponse(createTextStream(getAssistantText(assistantMessage)))
		}

		const messagesWithToolResults = [
			...messagesWithSystem,
			{
				role: 'assistant',
				content: assistantMessage.content || '',
				tool_calls: toolCalls
			},
			...toolCalls.map(toolCall => ({
				role: 'tool',
				tool_call_id: toolCall.id,
				name: toolCall.function.name,
				content: JSON.stringify(executeToolCall(toolCall))
			}))
		]

		// 8. 工具调用完成后，再流式生成最终回复
		const finalResponse = await fetch(ARK_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${ARK_API_KEY}`
			},
			body: JSON.stringify({
				model: ARK_MODEL,
				messages: messagesWithToolResults,
				stream: true
			})
		})

		if (!finalResponse.ok) {
			const errorText = await finalResponse.text()
			console.error('ARK API Error:', {
				status: finalResponse.status,
				statusText: finalResponse.statusText,
				body: errorText
			})
			return NextResponse.json(
				{ error: `AI 服务请求失败: ${finalResponse.statusText}` },
				{ status: finalResponse.status }
			)
		}

		// 9. 返回流式响应
		return createStreamResponse(finalResponse.body)
	} catch (error: any) {
		console.error('AI Chat Error:', error)
		return NextResponse.json(
			{ error: error.message || '服务器错误' },
			{ status: 500 }
		)
	}
}
