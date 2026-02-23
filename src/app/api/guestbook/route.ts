import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

// 初始化 Redis 客户端
// 环境变量会在 Vercel 创建 KV 数据库后自动添加
const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
	? new Redis({
			url: process.env.KV_REST_API_URL,
			token: process.env.KV_REST_API_TOKEN,
		})
	: null

const MESSAGES_KEY = 'guestbook:messages'
const RATE_LIMIT_PREFIX = 'guestbook:ratelimit:'
const RATE_LIMIT_DURATION = 60 // 60秒冷却时间

// 获取客户端 IP 地址
async function getClientIP(request: Request): Promise<string> {
	const headersList = await headers()
	const forwarded = headersList.get('x-forwarded-for')
	const realIP = headersList.get('x-real-ip')
	
	if (forwarded) {
		return forwarded.split(',')[0].trim()
	}
	if (realIP) {
		return realIP
	}
	return 'unknown'
}

// GET - 获取所有留言
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const isAdmin = searchParams.get('admin') === 'true'
		
		if (!redis) {
			// 开发环境回退到本地文件
			const fs = await import('fs')
			const path = await import('path')
			const messagesFile = path.join(process.cwd(), 'public/guestbook/messages.json')
			
			if (fs.existsSync(messagesFile)) {
				const data = fs.readFileSync(messagesFile, 'utf-8')
				const messages = JSON.parse(data)
				
				// 如果不是管理员，移除邮箱和 IP 信息
				if (!isAdmin) {
					return NextResponse.json(messages.map((msg: any) => {
						const { email, ip, ...rest } = msg
						return rest
					}))
				}
				
				return NextResponse.json(messages)
			}
			return NextResponse.json([])
		}

		const messages = await redis.get(MESSAGES_KEY) || []
		
		// 如果不是管理员，移除邮箱和 IP 信息
		if (!isAdmin && Array.isArray(messages)) {
			const filtered = messages.map((msg: any) => {
				const { email, ip, ...rest } = msg
				return rest
			})
			
			// 添加缓存头，缓存 30 秒
			return NextResponse.json(filtered, {
				headers: {
					'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
				}
			})
		}
		
		return NextResponse.json(messages)
	} catch (error) {
		console.error('Error reading messages:', error)
		return NextResponse.json([])
	}
}

// POST - 添加新留言
export async function POST(request: Request) {
	try {
		const newMessage = await request.json()
		const clientIP = await getClientIP(request)
		
		// 验证数据
		if (!newMessage.nickname || !newMessage.content) {
			return NextResponse.json(
				{ error: '昵称和内容不能为空' },
				{ status: 400 }
			)
		}

		if (newMessage.content.length > 100) {
			return NextResponse.json(
				{ error: '留言内容不能超过100字' },
				{ status: 400 }
			)
		}

		// 验证邮箱格式（如果提供了）
		if (newMessage.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMessage.email)) {
			return NextResponse.json(
				{ error: '邮箱格式不正确' },
				{ status: 400 }
			)
		}

		// 防刷屏检查（仅在 Redis 可用时）
		if (redis) {
			const rateLimitKey = `${RATE_LIMIT_PREFIX}${clientIP}`
			
			// 检查是否在冷却时间内
			const lastSubmitTime = await redis.get(rateLimitKey)
			if (lastSubmitTime) {
				const timeDiff = Date.now() - Number(lastSubmitTime)
				if (timeDiff < RATE_LIMIT_DURATION * 1000) {
					const remainingSeconds = Math.ceil((RATE_LIMIT_DURATION * 1000 - timeDiff) / 1000)
					return NextResponse.json(
						{ error: `请等待 ${remainingSeconds} 秒后再提交` },
						{ status: 429 }
					)
				}
			}
			
			// 记录本次提交时间
			await redis.set(rateLimitKey, Date.now(), { ex: RATE_LIMIT_DURATION })
		}

		// 添加 IP 地址到留言数据
		const messageWithIP = {
			...newMessage,
			ip: clientIP
		}

		if (!redis) {
			// 开发环境回退到本地文件
			const fs = await import('fs')
			const path = await import('path')
			const messagesFile = path.join(process.cwd(), 'public/guestbook/messages.json')
			const dir = path.dirname(messagesFile)
			
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}
			
			let messages = []
			if (fs.existsSync(messagesFile)) {
				const data = fs.readFileSync(messagesFile, 'utf-8')
				messages = JSON.parse(data)
			}
			
			messages.push(messageWithIP)
			fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf-8')
			
			return NextResponse.json({ success: true, message: messageWithIP })
		}

		// 读取现有留言
		const messages: any[] = (await redis.get(MESSAGES_KEY)) || []
		
		// 添加新留言
		messages.push(messageWithIP)
		
		// 保存到 Redis
		await redis.set(MESSAGES_KEY, messages)

		return NextResponse.json({ success: true, message: messageWithIP })
	} catch (error) {
		console.error('Error saving message:', error)
		return NextResponse.json(
			{ error: '保存失败' },
			{ status: 500 }
		)
	}
}
