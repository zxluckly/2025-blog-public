'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useCenterInit, useCenterStore } from '@/hooks/use-center'
import { Picture } from '../page'
import { cn } from '@/lib/utils'
import { useSize } from '@/hooks/use-size'
import dayjs from 'dayjs'

interface RandomLayoutProps {
	pictures: Picture[]
	isEditMode?: boolean
	onDeleteSingle?: (pictureId: string, imageIndex: number | 'single') => void
	onDeleteGroup?: (picture: Picture) => void
}

type PositionedItem = {
	x: number
	y: number
	rotation: number
}

interface FloatingImageProps {
	url: string
	index: number
	groupIndex: number
	position: PositionedItem
	description?: string
	uploadedAt?: string
	pictureId: string
	imageIndex: number | 'single'
	isEditMode?: boolean
	onDeleteSingle?: (pictureId: string, imageIndex: number | 'single') => void
	onDeleteGroup?: () => void
}

type UrlItem = {
	url: string
	groupIndex: number
	description?: string
	uploadedAt?: string
	pictureId: string
	imageIndex: number | 'single'
}

const TICKET_W = 310
const TICKET_H = 168
const IMAGE_W = 195
const STUB_W = TICKET_W - IMAGE_W // 115

// true = 详情页放大仍显示票根样式；false = 详情页放大显示原始大图样式
const DETAIL_USE_TICKET_STYLE = true

const buildUrlList = (pictures: Picture[]): UrlItem[] => {
	const result: UrlItem[] = []
	for (const [index, picture] of pictures.entries()) {
		if (picture.image) {
			result.push({ url: picture.image, groupIndex: index, description: picture.description, uploadedAt: picture.uploadedAt, pictureId: picture.id, imageIndex: 'single' })
		}
		if (picture.images && picture.images.length > 0) {
			result.push(...picture.images.map((url, imageIndex) => ({ url, groupIndex: index, description: picture.description, uploadedAt: picture.uploadedAt, pictureId: picture.id, imageIndex })))
		}
	}
	return result
}

let lastZIndex = 10
const TOP_Z_INDEX = 9999

const formatUploadedAt = (uploadedAt?: string) => {
	if (!uploadedAt) return ''
	const date = new Date(uploadedAt)
	if (Number.isNaN(date.getTime())) return uploadedAt
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	return `${year}-${month}-${day} ${hours}:${minutes}`
}

const loadSavedOffset = (url: string): { x: number; y: number } => {
	try {
		const saved = localStorage.getItem(`picture-offset-${url}`)
		if (saved) {
			const parsed = JSON.parse(saved)
			const x = parsed.x || 0
			const y = parsed.y || 0
			// 钳位到视口一半范围内，防止换设备/缩窗口后票根卡在屏幕外
			const halfW = window.innerWidth / 2
			const halfH = window.innerHeight / 2
			return {
				x: Math.max(-halfW, Math.min(halfW, x)),
				y: Math.max(-halfH, Math.min(halfH, y))
			}
		}
	} catch { /* empty */ }
	return { x: 0, y: 0 }
}

const saveOffset = (url: string, offset: { x: number; y: number }) => {
	try {
		localStorage.setItem(`picture-offset-${url}`, JSON.stringify(offset))
	} catch { /* empty */ }
}

const extractTicketInfo = (description?: string, uploadedAt?: string) => {
	const date = uploadedAt ? new Date(uploadedAt) : null
	const year = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : new Date().getFullYear()
	const month = date && !Number.isNaN(date.getTime()) ? date.getMonth() + 1 : new Date().getMonth() + 1
	const day = date && !Number.isNaN(date.getTime()) ? String(date.getDate()).padStart(2, '0') : '01'
	const hours = date && !Number.isNaN(date.getTime()) ? String(date.getHours()).padStart(2, '0') : '00'
	const minutes = date && !Number.isNaN(date.getTime()) ? String(date.getMinutes()).padStart(2, '0') : '00'
	let location = 'travel'
	if (description) {
		const firstPart = description.split(/[\s，。,.、！!？?]/)[0]
		location = firstPart.length > 4 ? firstPart.slice(0, 4) : firstPart || 'travel'
	}
	return { year, month, day, hours, minutes, location }
}

// Simple SVG barcode
const Barcode = ({ width = 82, height = 22 }: { width?: number; height?: number }) => {
	const pattern = [2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1]
	let x = 0
	const rects: { x: number; w: number }[] = []
	pattern.forEach((w, i) => {
		if (i % 2 === 0) rects.push({ x, w })
		x += w + 0.5
	})
	return (
		<svg width={width} height={height} viewBox={`0 0 ${x} ${height}`} preserveAspectRatio='none'>
			{rects.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={height} fill='#2a2018' />)}
		</svg>
	)
}

// Perforated divider between image and stub
const PerforatedDivider = ({ height }: { height: number }) => (
	<div style={{ width: 18, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #f5ede0)' }}>
		<svg width='2' height={height - 16} style={{ display: 'block' }}>
			<line x1='1' y1='0' x2='1' y2={height - 16} stroke='#b8b0a0' strokeWidth='1.5' strokeDasharray='3 3' />
		</svg>
	</div>
)

// The ticket card visual — always renders at TICKET_W × TICKET_H; parent controls scale
const TicketCard = ({
	url,
	description,
	uploadedAt,
	isEditMode,
	onDeleteSingle,
	pictureId,
	imageIndex,
}: {
	url: string
	description?: string
	uploadedAt?: string
	isEditMode?: boolean
	onDeleteSingle?: (pictureId: string, imageIndex: number | 'single') => void
	pictureId: string
	imageIndex: number | 'single'
}) => {
	const { year, month, day, hours, minutes, location } = extractTicketInfo(description, uploadedAt)

	// clip-path 实现顶部/底部真实半圆缺口，drop-shadow 跟随裁切形状
	const ticketPath = `M 14,0 L 196,0 A 8,8 0 0,0 212,0 L 296,0 Q 310,0 310,14 L 310,154 Q 310,168 296,168 L 212,168 A 8,8 0 0,0 196,168 L 14,168 Q 0,168 0,154 L 0,14 Q 0,0 14,0 Z`

	return (
		<div style={{ width: TICKET_W, height: TICKET_H, position: 'relative', filter: 'drop-shadow(3px 6px 18px rgba(80,60,30,0.18)) drop-shadow(0 1px 4px rgba(80,60,30,0.10))' }}>
		<div
			style={{
				width: TICKET_W,
				height: TICKET_H,
				display: 'flex',
				flexDirection: 'row',
				overflow: 'hidden',
				clipPath: `path('${ticketPath}')`,
				background: '#f5ede0',
				position: 'relative',
			}}
		>
			{/* Left: photo */}
			<div style={{ width: IMAGE_W, height: TICKET_H, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
				<img
					src={url}
					draggable={false}
					style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none' }}
					alt=''
				/>
				{/* subtle paper texture overlay */}
				<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
			</div>

			{/* Perforated divider */}
			<PerforatedDivider height={TICKET_H} />

			{/* Right: stub */}
			<div
				style={{
					width: STUB_W,
					height: TICKET_H,
					flexShrink: 0,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'space-evenly',
					padding: '10px 8px 8px',
					background: 'linear-gradient(160deg, #fdf8f0 0%, #f7f0e4 100%)',
					position: 'relative',
					overflow: 'hidden',
				}}
			>
				{/* decorative watercolor dots */}
				<div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,210,170,0.35) 0%, transparent 70%)', pointerEvents: 'none' }} />
				<div style={{ position: 'absolute', bottom: 28, left: 4, width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle, rgba(210,185,150,0.3) 0%, transparent 70%)', pointerEvents: 'none' }} />

				<div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', marginLeft: -15}}>
					<div style={{ fontSize: 8, letterSpacing: 1.5, color: '#8a7a65', fontFamily: 'serif', fontWeight: 600 }}>NO.{year}</div>
					<div style={{ width: '80%', height: 0.6, background: '#d4c4a8' }} />
					<div style={{ fontSize: 13, letterSpacing: 0.5, color: '#3a3028', fontFamily: 'Georgia, serif', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: STUB_W - 16, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{location}</div>
					<div style={{ width: '80%', height: 0.6, background: '#d4c4a8' }} />
					<div style={{ fontSize: 9, letterSpacing: 1, color: '#8a7a65', fontFamily: 'serif' }}>{year}-{month}</div>
					<div style={{ width: '80%', height: 0.6, background: '#d4c4a8' }} />
					<div style={{ fontSize: 8, letterSpacing: 1.5, color: '#8a7a65', fontFamily: 'serif', fontWeight: 600 }}>NO.{year}</div>
					<div style={{ fontSize: 7.5, letterSpacing: 1, color: '#a09080', fontFamily: 'serif' }}>TRAVEL TICKET</div>
				</div>

				{/* Barcode */}
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginLeft: -15}}>
					<Barcode width={STUB_W * 0.8} height={18} />
					<div style={{ fontSize: 6, color: '#b0a090', letterSpacing: 0.5, fontFamily: 'monospace' }}>
						{year}{String(month).padStart(2, '0')}{day}{hours}
					</div>
				</div>
			</div>

		</div>
		{/* edit mode delete button — 在 clip-path 外层，避免被裁切 */}
		{isEditMode && (
			<motion.button
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				onClick={e => {
					e.stopPropagation()
					onDeleteSingle?.(pictureId, imageIndex)
				}}
				onMouseUp={e => { e.stopPropagation() }}
				className='absolute -top-2 -right-2 rounded-full bg-red-500 p-1.5 shadow-lg hover:scale-105 hover:bg-red-600'
				style={{ zIndex: 1 }}>
				<svg xmlns='http://www.w3.org/2000/svg' className='h-3 w-3 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
					<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
				</svg>
			</motion.button>
		)}
		</div>
	)
}

const FloatingImage = ({
	url, index, groupIndex, position, description, uploadedAt,
	pictureId, imageIndex, isEditMode, onDeleteSingle, onDeleteGroup
}: FloatingImageProps) => {
	const { centerX, centerY } = useCenterStore()
	const { maxSM } = useSize()
	const bodyRef = useRef(document.body)
	const mouseDownTimeRef = useRef<number | null>(null)
	const [zIndex, setZIndex] = useState(index)
	const [show, setShow] = useState(false)
	const [dragOffset, setDragOffset] = useState(() => loadSavedOffset(url))
	const [isZoomed, setIsZoomed] = useState(false)
	const [originalSize, setOriginalSize] = useState<{ width: number; height: number } | null>(null)
	const dragStartOffsetRef = useRef({ x: 0, y: 0 })

	useEffect(() => {
		setTimeout(() => setShow(true), 200 * index)
	}, [])

	const zoomedScale = useMemo(() => {
		if (DETAIL_USE_TICKET_STYLE) {
			if (typeof window === 'undefined') return 1.8
			const padding = 36
			const maxW = document.documentElement.clientWidth - padding * 2
			const maxH = document.documentElement.clientHeight - padding * 2
			return Math.min(maxW / TICKET_W, maxH / TICKET_H, 4.2)
		}
		return 1
	}, [])

	const zoomedSize = useMemo(() => {
		if (DETAIL_USE_TICKET_STYLE || !originalSize) return { width: TICKET_W, height: TICKET_H }
		const padding = 24
		const maxW = document.documentElement.clientWidth - padding * 2
		const maxH = document.documentElement.clientHeight - padding * 2
		const scale = Math.min(maxW / originalSize.width, maxH / originalSize.height, 1)
		return { width: originalSize.width * scale, height: originalSize.height * scale }
	}, [originalSize])

	if (!position || !show) return null

	return (
		<>
			{isZoomed && (
				<motion.div
					onClick={() => setIsZoomed(false)}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.3 }}
					style={{ zIndex: TOP_Z_INDEX, background: 'rgba(245,238,225,0.72)' }}
					className='fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl'
				/>
			)}
			<motion.div
				drag={!isZoomed}
				dragConstraints={bodyRef}
				dragMomentum={false}
				onDragStart={() => { if (!isZoomed) dragStartOffsetRef.current = { ...dragOffset } }}
				onMouseDown={event => { lastZIndex++; setZIndex(lastZIndex); mouseDownTimeRef.current = event.timeStamp }}
				onMouseUp={event => {
					if (mouseDownTimeRef.current !== null) {
						const duration = event.timeStamp - mouseDownTimeRef.current
						if (duration <= 150) {
							if (!isZoomed) setIsZoomed(true)
							else if (maxSM) setIsZoomed(false)
						}
					}
					mouseDownTimeRef.current = null
				}}
				onDragEnd={(_, info) => {
					if (!isZoomed) {
						const newOffset = { x: dragStartOffsetRef.current.x + info.offset.x, y: dragStartOffsetRef.current.y + info.offset.y }
						setDragOffset(newOffset)
						saveOffset(url, newOffset)
					}
				}}
				initial={{
					width: TICKET_W,
					height: TICKET_H,
					zIndex,
					left: centerX + position.x,
					top: centerY + position.y,
					rotate: position.rotation,
					scale: 0.6,
					opacity: 0,
					x: dragOffset.x,
					y: dragOffset.y
				}}
				animate={
					isZoomed
						? DETAIL_USE_TICKET_STYLE
							? {
								zIndex: TOP_Z_INDEX,
								left: centerX,
								top: centerY,
								rotate: 0,
								scale: zoomedScale,
								opacity: 1,
								x: 0,
								y: 0,
								width: TICKET_W,
								height: TICKET_H,
							}
							: {
								zIndex: TOP_Z_INDEX,
								left: centerX,
								top: centerY,
								rotate: 0,
								scale: 1,
								opacity: 1,
								x: 0,
								y: 0,
								width: zoomedSize.width,
								height: zoomedSize.height,
							}
						: {
							zIndex,
							scale: 1,
							opacity: 1,
							left: centerX + position.x,
							top: centerY + position.y,
							rotate: position.rotation,
							x: dragOffset.x,
							y: dragOffset.y,
							width: TICKET_W,
							height: TICKET_H,
						}
				}
				transition={{ type: 'tween', ease: 'easeOut' }}
				className={cn(
					'pointer-events-auto absolute origin-center -translate-1/2 cursor-pointer transition-[scale]',
					!isEditMode && !isZoomed && 'hover:scale-105'
				)}
			>
				{!DETAIL_USE_TICKET_STYLE && (
					<img src={url} style={{ display: 'none' }} onLoad={e => {
						const img = e.currentTarget
						setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight })
					}} alt='' />
				)}
				{DETAIL_USE_TICKET_STYLE || !isZoomed ? (
					<TicketCard
						url={url}
						description={description}
						uploadedAt={uploadedAt}
						isEditMode={isEditMode && !isZoomed}
						onDeleteSingle={onDeleteSingle}
						pictureId={pictureId}
						imageIndex={imageIndex}
					/>
				) : (
					<motion.img
						src={url}
						draggable={false}
						className='h-full w-full object-cover select-none'
					/>
				)}
			</motion.div>

			{isZoomed && description && (
				<motion.div
					drag
					dragConstraints={maxSM ? undefined : bodyRef}
					dragMomentum={false}
					style={{
						zIndex: TOP_Z_INDEX + 1,
						right: maxSM ? 12 : centerX / 3,
						top: maxSM ? 12 : centerY,
						background: 'linear-gradient(145deg, #fdf6e8 0%, #f5ebd5 100%)',
						border: '1.5px solid #e0d0b0',
						boxShadow: '3px 5px 16px rgba(100,80,40,0.14), inset 0 1px 0 rgba(255,255,255,0.8)',
					}}
					className='fixed w-[200px] min-h-[150px] cursor-pointer rounded-xl p-5'
					initial={{ opacity: 0, scale: 0.4 }}
					animate={{ opacity: 1, scale: 1 }}
				>
					{/* decorative corner */}
					<div style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,210,160,0.4) 0%, transparent 70%)', pointerEvents: 'none' }} />
					<div style={{ fontSize: 10, color: '#a0906e', letterSpacing: 1, marginBottom: 6, fontFamily: 'serif' }}>
						{formatUploadedAt(uploadedAt)}
					</div>
					<div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg, #d4c4a0, transparent)', marginBottom: 8 }} />
					<div style={{ fontSize: 13, color: '#4a3c28', lineHeight: 1.6, fontFamily: 'serif' }}>
						{description}
					</div>
					{/* bottom stamp decoration */}
					<div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
						<div style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #c8b890', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
							<div style={{ fontSize: 7, color: '#8a7a55', textAlign: 'center', lineHeight: 1.2, fontFamily: 'serif' }}>TRAVEL<br />MEMO</div>
						</div>
					</div>
				</motion.div>
			)}
		</>
	)
}

const positionCacheRef = new Map<string, PositionedItem>()
const getStablePosition = (uniqueId: string, width: number, height: number): PositionedItem => {
	if (positionCacheRef.has(uniqueId)) return positionCacheRef.get(uniqueId)!
	let hash = 0
	for (let i = 0; i < uniqueId.length; i++) {
		const char = uniqueId.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash
	}
	const stableIndex = Math.abs(hash) % 10000
	const maxRadius = Math.min(width, height) / 2 - 120
	const goldenAngle = Math.PI * (3 - Math.sqrt(5))
	const t = (stableIndex % 1000) / 1000
	const radius = Math.pow(t, 0.8) * maxRadius
	const angle = stableIndex * goldenAngle
	const baseX = radius * Math.cos(angle)
	const baseY = radius * Math.sin(angle)
	const jitterSeed = Math.abs(hash) % 1000
	const jitterRadius = 12
	const jitterX = (jitterSeed % (jitterRadius * 2)) - jitterRadius
	const jitterY = ((jitterSeed * 7) % (jitterRadius * 2)) - jitterRadius
	const rotation = ((jitterSeed * 13) % 40) - 20
	const position = { x: baseX + jitterX, y: baseY + jitterY, rotation }
	positionCacheRef.set(uniqueId, position)
	return position
}

export const RandomLayout = ({ pictures, isEditMode = false, onDeleteSingle, onDeleteGroup }: RandomLayoutProps) => {
	useCenterInit()
	const { width, height } = useCenterStore()
	const [show, setShow] = useState(false)

	useEffect(() => { setTimeout(() => setShow(true), 1000) }, [])

	const urls = useMemo(() => buildUrlList(pictures), [pictures])
	const pictureMap = useMemo(() => {
		const map = new Map<string, Picture>()
		pictures.forEach(p => map.set(p.id, p))
		return map
	}, [pictures])

	if (!urls.length || !width || !height || !show) return null
	lastZIndex = urls.length + 11

	return (
		<>
			{urls.map((item, index) => {
				const picture = pictureMap.get(item.pictureId)
				const uniqueId = item.url
				const position = getStablePosition(uniqueId, width, height)
				return (
					<FloatingImage
						key={uniqueId}
						url={item.url}
						index={index}
						groupIndex={item.groupIndex}
						position={position}
						description={item.description}
						uploadedAt={item.uploadedAt}
						pictureId={item.pictureId}
						imageIndex={item.imageIndex}
						isEditMode={isEditMode}
						onDeleteSingle={onDeleteSingle}
						onDeleteGroup={picture ? () => onDeleteGroup?.(picture) : undefined}
					/>
				)
			})}
		</>
	)
}
