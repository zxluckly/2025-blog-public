import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

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

// GET - 获取所有留言
export async function GET() {
	try {
		if (!redis) {
			// 开发环境回退到本地文件
			const fs = await import('fs')
			const path = await import('path')
			const messagesFile = path.join(process.cwd(), 'public/guestbook/messages.json')
			
			if (fs.existsSync(messagesFile)) {
				const data = fs.readFileSync(messagesFile, 'utf-8')
				return NextResponse.json(JSON.parse(data))
			}
			return NextResponse.json([])
		}

		const messages = await redis.get(MESSAGES_KEY) || []
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
			
			messages.push(newMessage)
			fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf-8')
			
			return NextResponse.json({ success: true, message: newMessage })
		}

		// 读取现有留言
		const messages: any[] = (await redis.get(MESSAGES_KEY)) || []
		
		// 添加新留言
		messages.push(newMessage)
		
		// 保存到 Redis
		await redis.set(MESSAGES_KEY, messages)

		return NextResponse.json({ success: true, message: newMessage })
	} catch (error) {
		console.error('Error saving message:', error)
		return NextResponse.json(
			{ error: '保存失败' },
			{ status: 500 }
		)
	}
}
