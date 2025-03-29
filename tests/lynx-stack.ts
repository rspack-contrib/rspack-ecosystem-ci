import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'lynx-family/lynx-stack',
		branch: process.env.LYNX_STACK_REF ?? 'main',
		// TODO(colinaaa): enable Lynx for Web tests
		build: 'pnpm turbo build',
		test: 'test',
	})
}
