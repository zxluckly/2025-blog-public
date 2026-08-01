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
	url?: string
	description: string
	tags: string[]
	github?: string
	npm?: string
	detailImages?: string[]
	detailMarkdown?: string
}

type ToolResult = {
	toolName: string
	result: unknown
}

type ChatMessage = {
	role: string
	content: unknown
	[key: string]: unknown
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

function normalizeText(value: string): string {
	return value.toLowerCase().replace(/\s+/g, '')
}

function nullableString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null
}

function getProjectSummary(project: Project) {
	return {
		name: project.name,
		year: project.year,
		image: nullableString(project.image),
		url: nullableString(project.url),
		description: project.description,
		tags: project.tags || [],
		github: nullableString(project.github),
		npm: nullableString(project.npm)
	}
}

function getProjectFull(project: Project) {
	return {
		...getProjectSummary(project),
		detailImages: project.detailImages || [],
		detailMarkdown: nullableString(project.detailMarkdown)
	}
}

function getAllProjects() {
	return {
		status: 'success',
		count: projectList.length,
		projects: projectList.map(getProjectSummary),
		facts: {
			projectNames: projectList.map(project => project.name),
			years: projectList.map(project => project.year),
			urls: projectList.flatMap(project => [project.url, project.github, project.npm].filter(Boolean))
		}
	}
}

function getProjectDetail(query: string) {
	const normalizedQuery = normalizeText(query)

	if (!normalizedQuery) {
		return {
			status: 'need_query',
			message: '用户没有提供项目名称或关键词，请让用户补充要查询的项目。',
			projects: projectList.map(project => ({
				name: project.name,
				year: project.year,
				tags: project.tags || []
			}))
		}
	}

	const exactMatch = projectList.find(project => normalizeText(project.name) === normalizedQuery)
	if (exactMatch) {
		return {
			status: 'success',
			matchedBy: 'exact_name',
			project: getProjectFull(exactMatch)
		}
	}

	const nameMatches = projectList.filter(project => normalizeText(project.name).includes(normalizedQuery))
	if (nameMatches.length === 1) {
		return {
			status: 'success',
			matchedBy: 'partial_name',
			project: getProjectFull(nameMatches[0])
		}
	}

	const contentMatches = projectList.filter(project => {
		const searchable = normalizeText([
			project.name,
			project.description,
			project.github || '',
			project.url || '',
			...(project.tags || [])
		].join(' '))

		return searchable.includes(normalizedQuery)
	})

	if (contentMatches.length === 1) {
		return {
			status: 'success',
			matchedBy: 'content',
			project: getProjectFull(contentMatches[0])
		}
	}

	const candidates = nameMatches.length > 0 ? nameMatches : contentMatches

	return {
		status: candidates.length > 0 ? 'multiple_matches' : 'not_found',
		message: candidates.length > 0
			? '找到了多个可能匹配的项目，请让用户指定更准确的项目名称；不要自行选择。'
			: '未找到匹配项目，请让用户换一个项目名称或关键词。',
		candidates: candidates.map(getProjectSummary),
		allProjects: projectList.map(project => ({
			name: project.name,
			year: project.year,
			tags: project.tags || []
		}))
	}
}

function getSiteContent() {
	const content = siteContent as any
	return {
		status: 'success',
		meta: content.meta,
		socialButtons: (content.socialButtons || []).map((button: any) => ({
			id: button.id,
			type: button.type,
			value: nullableString(button.value),
			label: nullableString(button.label),
			order: button.order
		})),
		beian: content.beian,
		facts: {
			emails: (content.socialButtons || [])
				.filter((button: any) => button.type === 'email')
				.map((button: any) => button.value)
				.filter(Boolean),
			urls: (content.socialButtons || [])
				.filter((button: any) => button.type !== 'email')
				.map((button: any) => button.value)
				.filter(Boolean)
		}
	}
}

function getLastUserText(messages: ChatMessage[]): string {
	const lastUser = [...messages].reverse().find(message => message.role === 'user')
	const content = lastUser?.content

	if (typeof content === 'string') return content
	if (Array.isArray(content)) {
		return content
			.map((item: any) => item?.text || '')
			.filter(Boolean)
			.join('\n')
	}

	return ''
}

function planRequiredTools(userText: string): ToolResult[] {
	const planned: ToolResult[] = []
	const text = normalizeText(userText)

	if (/联系|邮箱|email|qq|github|主页|站点|网站|社交|作者/.test(userText)) {
		planned.push({ toolName: 'get_site_content', result: getSiteContent() })
	}

	if (/全部项目|项目列表|有哪些项目|项目总览|所有项目|项目展示|技术栈|tech_stack/.test(userText)) {
		planned.push({ toolName: 'get_all_projects', result: getAllProjects() })
	}

	const project = projectList.find(item => text.includes(normalizeText(item.name)))
	if (project) {
		planned.push({ toolName: 'get_project_detail', result: getProjectDetail(project.name) })
	}

	return planned
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

async function fetchArk(body: Record<string, unknown>) {
	const response = await fetch(ARK_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${ARK_API_KEY}`
		},
		body: JSON.stringify(body)
	})

	if (!response.ok) {
		const errorText = await response.text()
		console.error('ARK API Error:', {
			status: response.status,
			statusText: response.statusText,
			body: errorText
		})
		throw new Error(`AI 服务请求失败: ${response.statusText}`)
	}

	return response
}

function createFactInstruction(toolResults: ToolResult[]) {
	return `以下是服务端工具返回的唯一可信事实源。你可以总结和组织语言，但事实值必须逐字符引用，尤其是项目名、年份、邮箱、QQ、GitHub、URL、技术栈。缺失字段为 null 时只能说“源数据未提供”，禁止补全或猜测。请输出合法 Markdown，禁止输出原始 HTML。\n\n${JSON.stringify(toolResults, null, 2)}`
}

async function streamFinalAnswer(messages: ChatMessage[], toolResults: ToolResult[]) {
	return fetchArk({
		model: ARK_MODEL,
		messages: [
			...messages,
			{
				role: 'system',
				content: createFactInstruction(toolResults)
			}
		],
		stream: true
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

const SYSTEM_PROMPT = `你是真寻，ZX 的网站助手。

你可以友好、轻松地总结网站、作者和项目内容，可用颜文字，鼓励用户留言交流。但所有事实都必须来自服务端注入的可信资料或用户本轮明确提供的信息。

事实规则：
- 服务端会在需要时自动注入作者主页、联系方式、项目列表或项目详情等可信资料；你不需要也不能主动输出工具调用。
- 禁止输出类似 <|FunctionCallBegin|>、<|FunctionCallEnd|>、tool_call、get_site_content、get_all_projects、get_project_detail 的工具调用标记或伪代码。
- 如果服务端没有注入相关可信资料，不得凭记忆回答联系方式、项目年份、项目名称、邮箱、QQ 或任何 URL。
- 可信资料中的邮箱、QQ、GitHub、URL、项目名和年份必须逐字符保留，不得缩写、截断、补全、改写或翻译。
- 可信资料字段为 null、空字符串或未提供时，只能说明“源数据未提供”，不得自行生成。
- 多候选项目时必须让用户进一步指定项目，不要猜。

输出规则：
- 使用合法 Markdown 输出，可以自然总结，不要机械模板化。
- 列表和链接要使用标准 Markdown 语法。
- 禁止输出原始 HTML。`

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

		const safeMessages = messages.map((message: ChatMessage) => ({
			role: message.role,
			content: message.content
		}))

		const messagesWithSystem = [
			{
				role: 'system',
				content: SYSTEM_PROMPT
			},
			...safeMessages
		]
		const userText = getLastUserText(safeMessages)
		const plannedToolResults = planRequiredTools(userText)

		console.log('Sending request to ARK API:', {
			model: ARK_MODEL,
			messageCount: messagesWithSystem.length,
			plannedToolCount: plannedToolResults.length,
			clientId: clientId.slice(0, 20) + '...' // 只记录部分 ID
		})

		if (plannedToolResults.length > 0) {
			const response = await streamFinalAnswer(messagesWithSystem, plannedToolResults)
			return createStreamResponse(response.body)
		}

		// 6. 没有命中确定事实意图时，恢复为单次直接流式响应，避免额外等待
		const response = await fetchArk({
			model: ARK_MODEL,
			messages: messagesWithSystem,
			stream: true
		})

		return createStreamResponse(response.body)
	} catch (error: any) {
		console.error('AI Chat Error:', error)
		return NextResponse.json(
			{ error: error.message || '服务器错误' },
			{ status: 500 }
		)
	}
}
