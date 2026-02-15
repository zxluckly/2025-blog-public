import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const messagesFile = path.join(process.cwd(), 'public/guestbook/messages.json')

// 确保目录和文件存在
function ensureFile() {
	const dir = path.dirname(messagesFile)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	if (!fs.existsSync(messagesFile)) {
		fs.writeFileSync(messagesFile, '[]', 'utf-8')
	}
}

// GET - 获取所有留言
export async function GET() {
	try {
		ensureFile()
		const data = fs.readFileSync(messagesFile, 'utf-8')
		const messages = JSON.parse(data)
		return NextResponse.json(messages)
	} catch (error) {
		console.error('Error reading messages:', error)
		return NextResponse.json([])
	}
}

// POST - 添加新留言
export async function POST(request: Request) {
	try {
		ensureFile()
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

		// 读取现有留言
		const data = fs.readFileSync(messagesFile, 'utf-8')
		const messages = JSON.parse(data)

		// 添加新留言
		messages.push(newMessage)

		// 保存到文件
		fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf-8')

		return NextResponse.json({ success: true, message: newMessage })
	} catch (error) {
		console.error('Error saving message:', error)
		return NextResponse.json(
			{ error: '保存失败' },
			{ status: 500 }
		)
	}
}
