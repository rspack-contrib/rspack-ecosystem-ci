import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'lynx-family/lynx-stack',
		branch: process.env.LYNX_STACK_REF ?? 'main',
		beforeBuild: `rustup target add wasm32-unknown-unknown`,
		// TODO(colinaaa): enable Lynx for Web tests
		build: 'pnpm turbo build',
		test: 'test',
	})
}
