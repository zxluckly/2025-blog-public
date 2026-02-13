const fs = require('fs')
const path = require('path')

const musicDir = path.join(__dirname, '../public/music')
const outputFile = path.join(__dirname, '../public/music/list.json')

// 读取音乐目录
const files = fs.readdirSync(musicDir)

// 过滤音频文件
const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
const musicFiles = files
	.filter(file => {
		const ext = path.extname(file).toLowerCase()
		return audioExtensions.includes(ext)
	})
	.map(file => {
		// 从文件名提取歌曲名称（去掉扩展名）
		const nameWithoutExt = path.basename(file, path.extname(file))
		return {
			name: nameWithoutExt,
			path: `/music/${file}`
		}
	})

// 写入 JSON 文件
fs.writeFileSync(outputFile, JSON.stringify(musicFiles, null, 2), 'utf-8')

console.log(`✅ 已生成音乐列表: ${musicFiles.length} 首歌曲`)
musicFiles.forEach(music => {
	console.log(`   - ${music.name}`)
})
