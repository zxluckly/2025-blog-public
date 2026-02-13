import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		const musicDir = path.join(process.cwd(), 'public/music')
		
		// 检查目录是否存在
		if (!fs.existsSync(musicDir)) {
			return NextResponse.json([])
		}

		const files = fs.readdirSync(musicDir)
		
		// 过滤音频文件
		const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
		const musicFiles = files
			.filter(file => {
				const ext = path.extname(file).toLowerCase()
				return audioExtensions.includes(ext)
			})
			.map(file => {
				const nameWithoutExt = path.basename(file, path.extname(file))
				return {
					name: nameWithoutExt,
					path: `/music/${encodeURIComponent(file)}`
				}
			})

		return NextResponse.json(musicFiles)
	} catch (error) {
		console.error('Error reading music directory:', error)
		return NextResponse.json([])
	}
}
