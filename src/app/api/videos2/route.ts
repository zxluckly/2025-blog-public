import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		const videosDir = path.join(process.cwd(), 'public/videos2')

		if (!fs.existsSync(videosDir)) {
			return NextResponse.json([])
		}

		const files = fs.readdirSync(videosDir)

		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv']
		const videoFiles = files
			.filter(file => {
				const ext = path.extname(file).toLowerCase()
				return videoExtensions.includes(ext)
			})
			.map(file => {
				const nameWithoutExt = path.basename(file, path.extname(file))
				const stats = fs.statSync(path.join(videosDir, file))
				return {
					id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
					title: nameWithoutExt,
					path: `/videos2/${encodeURIComponent(file)}`,
					uploadedAt: stats.birthtime.toISOString()
				}
			})
			.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

		return NextResponse.json(videoFiles)
	} catch (error) {
		console.error('Error reading videos2 directory:', error)
		return NextResponse.json([])
	}
}
