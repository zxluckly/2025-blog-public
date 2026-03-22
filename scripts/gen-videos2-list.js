const fs = require('fs')
const path = require('path')

const videosDir = path.join(__dirname, '../public/videos2')
const outputFile = path.join(__dirname, '../public/videos2/list.json')

if (!fs.existsSync(videosDir)) {
	fs.mkdirSync(videosDir, { recursive: true })
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
			path: `/videos2/${file}`,
			uploadedAt: stats.birthtime.toISOString()
		}
	})
	.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

fs.writeFileSync(outputFile, JSON.stringify(videoFiles, null, 2), 'utf-8')

console.log(`✅ 已生成其它视频列表: ${videoFiles.length} 个视频`)
videoFiles.forEach(video => {
	console.log(`   - ${video.title}`)
})
