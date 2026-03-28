'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'motion/react'

interface Tag {
	text: string
	color: string
}

// 预设颜色池
const colorPalette = [
	'#61DAFB', '#3178C6', '#339933', '#06B6D4', '#4FC08D',
	'#3776AB', '#2496ED', '#F05032', '#F7DF1E', '#1572B6',
	'#E34F26', '#47A248', '#4169E1', '#DC382D', '#E10098',
	'#009688', '#8DD6F9', '#646CFF', '#FF9900', '#FCC624',
	'#009639', '#4479A1', '#FF6B6B', '#4ECDC4', '#45B7D1',
	'#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
]

interface TagPosition {
	tag: Tag
	top: number
	duration: number
	delay: number
	/** 仅首段：随机水平起点，覆盖视口宽度（vw） */
	initialX: string
	/** 与 initialX 对应的数值（vw），用于按路程缩放首段时长 */
	initialXvw: number
}

interface DanmakuTagsProps {
	tags?: string[]
}

// 随机选择颜色
function getRandomColor(): string {
	return colorPalette[Math.floor(Math.random() * colorPalette.length)]
}

// 检查两个标签是否重叠
function isOverlapping(pos1: TagPosition, pos2: TagPosition, tagHeight: number = 40): boolean {
	const verticalGap = 10 // 垂直间距
	return Math.abs(pos1.top - pos2.top) < (tagHeight + verticalGap)
}

/** 首段：与「从 100vw 到 -100%」同量纲的近似路程（vw），用于按比例缩 duration，避免左侧路程短却用满 30–60s 导致视速度极慢 */
function approximateFirstPhaseSpanVw(initialXvw: number): number {
	return Math.max(0.1, initialXvw + 110)
}

const FIRST_PHASE_REF_SPAN_VW = approximateFirstPhaseSpanVw(100) // 与原先统一从右侧出发时同量级

// 生成不重叠的随机位置
function generatePositions(tagTexts: string[]): TagPosition[] {
	const positions: TagPosition[] = []
	const minTop = 5
	const maxTop = 85
	const maxAttempts = 50

	for (const text of tagTexts) {
		let attempts = 0
		let position: TagPosition | null = null

		while (attempts < maxAttempts) {
			// 首帧随机水平分布全屏（略超出左右边缘，避免挤在右侧）
			const initialXvw = Math.random() * 130 - 30
			const initialX = `${initialXvw}vw`
			const candidatePosition: TagPosition = {
				tag: { text, color: getRandomColor() },
				top: minTop + Math.random() * (maxTop - minTop),
				duration: 30 + Math.random() * 30, // 30-60秒（循环段；首段会按路程比例缩短）
				delay: Math.random() * 10, // 保留生成逻辑；首段与循环段 transition 均为 delay 0（与原无限循环一致）
				initialX,
				initialXvw
			}

			// 检查是否与已有位置重叠
			const hasOverlap = positions.some(pos => isOverlapping(pos, candidatePosition))

			if (!hasOverlap) {
				position = candidatePosition
				break
			}

			attempts++
		}

		// 如果尝试多次仍然重叠，使用最后一次生成的位置
		if (position) {
			positions.push(position)
		} else {
			const initialXvw = Math.random() * 130 - 30
			positions.push({
				tag: { text, color: getRandomColor() },
				top: minTop + Math.random() * (maxTop - minTop),
				duration: 30 + Math.random() * 30,
				delay: Math.random() * 10,
				initialX: `${initialXvw}vw`,
				initialXvw
			})
		}
	}

	return positions
}

const defaultTagTexts = [
  //前端框架
  'Vue.js', 'UniApp', 'HTML5', 'CSS3', 'JavaScript', 'Element UI', 'ECharts',
  'React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Motion',
  // 后端核心
  'Python', 'Java', 'Spring Boot', 'Django', 'Flask', 'Node.js', 'REST API',
  // 数据库与大数据
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Neo4j', 'Hadoop', 'Spark',
  // 人工智能/深度学习
  'OpenCV', 'YOLO', 'YOLO11', 'TensorFlow', 'PyTorch', 'CNN', 'LSTM',
  // 开发工具与部署
  'Git', 'Docker', 'Linux', 'Nginx', '阿里云', 'Vercel', 'Github API',
]

function DanmakuTag({ position }: { position: TagPosition }) {
	const [loopFromRight, setLoopFromRight] = useState(false)

	const firstPhaseDuration = useMemo(() => {
		const span = approximateFirstPhaseSpanVw(position.initialXvw)
		return position.duration * (span / FIRST_PHASE_REF_SPAN_VW)
	}, [position.duration, position.initialXvw])

	return (
		<motion.div
			key={loopFromRight ? 'loop' : 'first'}
			className='absolute flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 backdrop-blur-sm'
			style={{
				top: `${position.top}%`,
				borderColor: `${position.tag.color}30`,
				backgroundColor: `${position.tag.color}10`
			}}
			initial={{ x: loopFromRight ? '100vw' : position.initialX }}
			animate={{ x: '-100%' }}
			transition={{
				duration: loopFromRight ? position.duration : firstPhaseDuration,
				ease: 'linear',
				delay: 0,
				...(loopFromRight ? { repeat: Infinity } : {})
			}}
			onAnimationComplete={() => {
				if (!loopFromRight) {
					setLoopFromRight(true)
				}
			}}
		>
			<div className='h-2 w-2 rounded-full' style={{ backgroundColor: position.tag.color }} />
			<span
				className='whitespace-nowrap text-sm font-medium'
				style={{
					color: position.tag.color,
					textShadow: `0 0 10px ${position.tag.color}40`
				}}
			>
				{position.tag.text}
			</span>
		</motion.div>
	)
}

export default function DanmakuTags({ tags = defaultTagTexts }: DanmakuTagsProps) {
	const [mounted, setMounted] = useState(false)

	// 使用 useMemo 确保位置在客户端渲染时保持一致
	const positions = useMemo(() => generatePositions(tags), [tags])

	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) return null

	return (
		<div className='pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-40 max-sm:opacity-20'>
			{positions.map((position, index) => (
				<DanmakuTag key={index} position={position} />
			))}
		</div>
	)
}
