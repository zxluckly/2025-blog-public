import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

const redis =
	process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
		? new Redis({
				url: process.env.KV_REST_API_URL,
				token: process.env.KV_REST_API_TOKEN
			})
		: null

const countKey = (slug: string) => `likes:count:${slug}`
const dayRateKey = (ip: string, slug: string) =>
	`likes:ratelimit:${ip}:${slug}:${new Date().toISOString().slice(0, 10)}`

async function getClientIP(request: Request): Promise<string> {
	const headersList = await headers()
	const forwarded = headersList.get('x-forwarded-for')
	const realIP = headersList.get('x-real-ip')
	if (forwarded) return forwarded.split(',')[0].trim()
	if (realIP) return realIP
	return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

type LikesFile = { counts: Record<string, number> }

async function readFileCounts(): Promise<Record<string, number>> {
	const fs = await import('fs')
	const path = await import('path')
	const file = path.join(process.cwd(), 'public/likes.json')
	if (!fs.existsSync(file)) return {}
	try {
		const raw = fs.readFileSync(file, 'utf-8')
		const data = JSON.parse(raw) as LikesFile
		return data.counts ?? {}
	} catch {
		return {}
	}
}

async function writeFileCounts(counts: Record<string, number>) {
	const fs = await import('fs')
	const path = await import('path')
	const file = path.join(process.cwd(), 'public/likes.json')
	const dir = path.dirname(file)
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(file, JSON.stringify({ counts }, null, 2), 'utf-8')
}

/** GET /api/likes?slug=xxx */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const slug = searchParams.get('slug')?.trim()
		if (!slug) {
			return NextResponse.json({ error: 'missing slug' }, { status: 400 })
		}

		if (!redis) {
			const counts = await readFileCounts()
			const count = counts[slug] ?? 0
			return NextResponse.json({ count }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
		}

		const raw = await redis.get<number>(countKey(slug))
		const count = typeof raw === 'number' ? raw : 0
		return NextResponse.json(
			{ count },
			{ headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
		)
	} catch (e) {
		console.error('likes GET', e)
		return NextResponse.json({ count: 0 })
	}
}

/** POST /api/likes?slug=xxx — 与留言板共用 Redis，按 slug 累计点赞 */
export async function POST(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const slug = searchParams.get('slug')?.trim()
		if (!slug) {
			return NextResponse.json({ error: 'missing slug' }, { status: 400 })
		}

		const clientIP = await getClientIP(request)

		if (!redis) {
			const counts = await readFileCounts()
			const next = (counts[slug] ?? 0) + 1
			counts[slug] = next
			await writeFileCounts(counts)
			return NextResponse.json({ count: next })
		}

		const rlKey = dayRateKey(clientIP, slug)
		const already = await redis.get(rlKey)
		if (already) {
			const raw = await redis.get<number>(countKey(slug))
			const count = typeof raw === 'number' ? raw : 0
			return NextResponse.json({ count, reason: 'rate_limited' })
		}

		await redis.set(rlKey, '1', { ex: 86400 })
		const count = await redis.incr(countKey(slug))

		return NextResponse.json({ count })
	} catch (e) {
		console.error('likes POST', e)
		return NextResponse.json({ error: 'failed' }, { status: 500 })
	}
}
