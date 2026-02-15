import { toBase64Utf8, getRef, createTree, createCommit, updateRef, createBlob, type TreeItem } from '@/lib/github-client'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'

export interface Message {
	id: string
	nickname: string
	content: string
	timestamp: string
	color: string
	x: number
	y: number
	scale?: number
}

export async function pushMessage(newMessage: Message): Promise<void> {
	const token = await getAuthToken()

	// 获取当前分支信息
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const latestCommitSha = refData.sha

	// 读取现有留言
	const response = await fetch('/api/guestbook')
	const existingMessages: Message[] = await response.json()

	// 添加新留言
	const updatedMessages = [...existingMessages, newMessage]

	// 准备文件
	const treeItems: TreeItem[] = []

	const messagesJson = JSON.stringify(updatedMessages, null, 2)
	const messagesBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(messagesJson), 'base64')
	treeItems.push({
		path: 'public/guestbook/messages.json',
		mode: '100644',
		type: 'blob',
		sha: messagesBlob.sha
	})

	// 创建文件树
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)

	// 创建提交
	const commitMessage = `新增留言: ${newMessage.nickname}`
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, commitMessage, treeData.sha, [latestCommitSha])

	// 更新分支
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)
}
