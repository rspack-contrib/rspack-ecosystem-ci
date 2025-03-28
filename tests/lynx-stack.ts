import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'lynx-family/lynx-stack',
		branch: process.env.LYNX_STACK_REF ?? 'main',
		build: 'pnpm turbo build',
		test: 'test',
	})
}
