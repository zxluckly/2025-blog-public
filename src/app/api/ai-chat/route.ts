import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ARK_API_KEY = process.env.ARK_API_KEY
const ARK_MODEL = process.env.ARK_MODEL || 'ep-20250310111028-lvbvn'
const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

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
		if (!ARK_API_KEY) {
			console.error('ARK_API_KEY not configured')
			return NextResponse.json(
				{ error: 'ARK_API_KEY 未配置，请在环境变量中设置' },
				{ status: 500 }
			)
		}

		const body = await request.json()
		const { messages } = body

		if (!messages || !Array.isArray(messages)) {
			return NextResponse.json(
				{ error: '无效的消息格式' },
				{ status: 400 }
			)
		}

		// 在用户消息前添加系统提示词
		const messagesWithSystem = [
			{
				role: 'system',
				content: SYSTEM_PROMPT
			},
			...messages
		]

		console.log('Sending request to ARK API:', {
			model: ARK_MODEL,
			messageCount: messagesWithSystem.length
		})

		// 调用火山引擎 API
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

		// 返回流式响应
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
