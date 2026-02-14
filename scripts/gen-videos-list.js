const fs = require('fs')
const path = require('path')

const videosDir = path.join(__dirname, '../public/videos')
const outputFile = path.join(__dirname, '../public/videos/list.json')

// 确保目录存在
if (!fs.existsSync(videosDir)) {
	fs.mkdirSync(videosDir, { recursive: true })
}

// 读取视频目录
const files = fs.readdirSync(videosDir)

// 过滤视频文件
const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv']
const videoFiles = files
	.filter(file => {
		const ext = path.extname(file).toLowerCase()
		return videoExtensions.includes(ext)
	})
	.map(file => {
		// 从文件名提取视频标题（去掉扩展名）
		const nameWithoutExt = path.basename(file, path.extname(file))
		const stats = fs.statSync(path.join(videosDir, file))
		return {
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			title: nameWithoutExt,
			path: `/videos/${file}`,
			uploadedAt: stats.birthtime.toISOString()
		}
	})
	.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

// 写入 JSON 文件
fs.writeFileSync(outputFile, JSON.stringify(videoFiles, null, 2), 'utf-8')

console.log(`✅ 已生成视频列表: ${videoFiles.length} 个视频`)
videoFiles.forEach(video => {
	console.log(`   - ${video.title}`)
})
