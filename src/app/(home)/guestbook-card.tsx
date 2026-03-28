'use client'

import { useMemo, memo } from 'react'
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from './stores/config-store'
import { CARD_SPACING } from '@/consts'
import { HomeDraggableLayer } from './home-draggable-layer'
import { MessageCircle } from 'lucide-react'
import { useSize } from '@/hooks/use-size'

function GuestbookCard() {
	const router = useRouter()
	const center = useCenterStore()
	const { cardStyles } = useConfigStore()
	const { maxSM } = useSize()
	const styles = cardStyles.guestbookCard
	const hiCardStyles = cardStyles.hiCard

	const position = useMemo(() => {
		return {
			x: styles.offsetX !== null ? center.x + styles.offsetX : center.x + hiCardStyles.width / 2 + CARD_SPACING,
			y: styles.offsetY !== null ? center.y + styles.offsetY : center.y + hiCardStyles.height / 2 + CARD_SPACING
		}
	}, [center, styles, hiCardStyles])

	const { x, y } = position

	const handleClick = () => {
		router.push('/guestbook')
	}

	return (
		<HomeDraggableLayer cardKey='guestbookCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card
				order={styles.order}
				width={styles.width}
				height={styles.height}
				x={x}
				y={y}
				className='group flex cursor-pointer items-center gap-3 overflow-hidden p-4 max-sm:static'
			>
				<motion.div
					onClick={handleClick}
					className='bg-brand/10 relative z-20 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full'
					whileHover={{ scale: 1.1, rotate: 5 }}
					transition={{ type: 'spring', stiffness: 300 }}
				>
					<MessageCircle className='text-brand h-5 w-5' />
				</motion.div>

				<div onClick={handleClick} className='relative z-20 flex-1'>
					<div className='text-sm font-medium'>留言板</div>
					<div className='text-secondary text-xs'>留下你的足迹</div>
				</div>

				{/* 悬停效果 */}
				<motion.div
					className='bg-brand/5 pointer-events-none absolute inset-0 z-0'
					initial={{ opacity: 0 }}
					whileHover={{ opacity: 1 }}
					transition={{ duration: 0.2 }}
				/>
			</Card>
		</HomeDraggableLayer>
	)
}

export default memo(GuestbookCard)
