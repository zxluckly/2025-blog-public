import { toBase64Utf8, getRef, createTree, createCommit, updateRef, createBlob, type TreeItem } from '@/lib/github-client'
import { fileToBase64NoPrefix, hashFileSHA256 } from '@/lib/file-utils'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import type { Project } from '../components/project-card'
import type { ImageItem } from '../components/image-upload-dialog'
import { getFileExt } from '@/lib/utils'
import { toast } from 'sonner'

export type PushProjectsParams = {
	projects: Project[]
	imageItems?: Map<string, ImageItem>
	detailImageFiles?: Map<string, File[]>
}

const isBlobUrl = (value?: string) => typeof value === 'string' && value.startsWith('blob:')

export async function pushProjects(params: PushProjectsParams): Promise<void> {
	const { projects, imageItems, detailImageFiles } = params

	const token = await getAuthToken()

	toast.info('正在获取分支信息...')
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const latestCommitSha = refData.sha

	const commitMessage = `更新项目列表`

	toast.info('正在准备文件...')

	const treeItems: TreeItem[] = []
	const uploadedHashes = new Set<string>()
	let updatedProjects = [...projects]

	// 上传封面图片
	if (imageItems && imageItems.size > 0) {
		toast.info('正在上传封面图片...')
		for (const [projectName, imageItem] of imageItems.entries()) {
			if (imageItem.type === 'file') {
				const hash = imageItem.hash || (await hashFileSHA256(imageItem.file))
				const ext = getFileExt(imageItem.file.name)
				const filename = `${hash}${ext}`
				const publicPath = `/images/project/${filename}`

				if (!uploadedHashes.has(hash)) {
					const path = `public/images/project/${filename}`
					const contentBase64 = await fileToBase64NoPrefix(imageItem.file)
					const blobData = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, contentBase64, 'base64')
					treeItems.push({
						path,
						mode: '100644',
						type: 'blob',
						sha: blobData.sha
					})
					uploadedHashes.add(hash)
				}

				updatedProjects = updatedProjects.map(p => (p.name === projectName ? { ...p, image: publicPath } : p))
			}
		}
	}

	// 上传详情图片
	if (detailImageFiles && detailImageFiles.size > 0) {
		toast.info('正在上传详情图片...')
		for (const [projectName, files] of detailImageFiles.entries()) {
			const uploadedUrls: string[] = []
			
			for (const file of files) {
				const hash = await hashFileSHA256(file)
				const ext = getFileExt(file.name)
				const filename = `${hash}${ext}`
				const publicPath = `/images/project/${filename}`

				if (!uploadedHashes.has(hash)) {
					const path = `public/images/project/${filename}`
					const contentBase64 = await fileToBase64NoPrefix(file)
					const blobData = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, contentBase64, 'base64')
					treeItems.push({
						path,
						mode: '100644',
						type: 'blob',
						sha: blobData.sha
					})
					uploadedHashes.add(hash)
				}

				uploadedUrls.push(publicPath)
			}

			// 更新项目的详情图片路径
			updatedProjects = updatedProjects.map(p => {
				if (p.name === projectName) {
					// 合并已有的 URL 图片和新上传的图片
					const existingUrls = (p.detailImages || []).filter(url => !isBlobUrl(url))
					return { ...p, detailImages: [...existingUrls, ...uploadedUrls] }
				}
				return p
			})
		}
	}

	updatedProjects = updatedProjects.map(project => ({
		...project,
		detailImages: project.detailImages?.filter(url => !isBlobUrl(url))
	}))

	const invalidCoverProject = updatedProjects.find(project => isBlobUrl(project.image))
	if (invalidCoverProject) {
		throw new Error(`项目「${invalidCoverProject.name}」的封面图片仍是本地预览地址，保存已中止，请重新选择封面图片后再保存。`)
	}

	const projectsJson = JSON.stringify(updatedProjects, null, '\t')
	const projectsBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(projectsJson), 'base64')
	treeItems.push({
		path: 'src/app/projects/list.json',
		mode: '100644',
		type: 'blob',
		sha: projectsBlob.sha
	})

	toast.info('正在创建文件树...')
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)

	toast.info('正在创建提交...')
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, commitMessage, treeData.sha, [latestCommitSha])

	toast.info('正在更新分支...')
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)

	toast.success('发布成功！')
}
