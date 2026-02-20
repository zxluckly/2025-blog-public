import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

export const dynamic = 'force-dynamic'

const ARK_API_KEY = process.env.ARK_API_KEY
const ARK_MODEL = process.env.ARK_MODEL || 'ep-20250310111028-lvbvn'
const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

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

	const now = Date.now()
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
		'www.zxluky.asia'
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

// 系统提示词 - 介绍网站和作者
const SYSTEM_PROMPT = `你是一个名为真寻且友好、热情的助手，负责帮助访问者了解这个技术博客网站和作者。

## 关于这个网站
这是一个用心搭建的个人技术博客，作者是一位刚踏入开发领域的新人。网站的特点：
- 用朴实的文字分享实用的技术内容
- 希望和同样在学习路上的人一起成长
- 音乐播放，留言板，我的项目，视频库
- 页面风格：温暖，舒适，可爱

## 关于作者
作者是一位热爱技术的开发者，有以下特点：
- 刚开始技术分享，用心记录成长过程
- 除了写代码，还喜欢追番、打游戏
- 喜欢捣鼓各种稀奇古怪的小玩意儿
- 联系方式：QQ3190925010，邮箱：haochenwu7@gmail.com

## 技术栈
**前端：**
- Vue.js、React、TypeScript、Next.js

**后端：**
- Python、Java、Spring Boot、Node.js

**数据 / AI：**
- MySQL、Redis、PyTorch、计算机视觉

**工具 / 部署：**
- Git、Docker、Linux、阿里云

## 你的角色
当用户询问关于网站、作者或技术相关的问题时：
1. 用友好、轻松的语气回答
2. 可以适当使用表情符号或颜文字，让对话更生动
3. 如果用户问到作者的技术栈，详细介绍上述内容
4. 鼓励用户在留言板留言交流
5. 对于技术问题，提供实用的建议和解答
6. 保持谦逊和真诚的态度

记住：这是一个温馨的技术分享空间，作者希望和大家一起学习成长！`

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

		// 7. 调用火山引擎 API
		const response = await fetch(ARK_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${ARK_API_KEY}`
			},
			body: JSON.stringify({
				model: ARK_MODEL,
				messages: messagesWithSystem,
				stream: true
			})
		})

		if (!response.ok) {
			const errorText = await response.text()
			console.error('ARK API Error:', {
				status: response.status,
				statusText: response.statusText,
				body: errorText
			})
			return NextResponse.json(
				{ error: `AI 服务请求失败: ${response.statusText}` },
				{ status: response.status }
			)
		}

		// 8. 返回流式响应
		return new Response(response.body, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		})
	} catch (error: any) {
		console.error('AI Chat Error:', error)
		return NextResponse.json(
			{ error: error.message || '服务器错误' },
			{ status: 500 }
		)
	}
}
