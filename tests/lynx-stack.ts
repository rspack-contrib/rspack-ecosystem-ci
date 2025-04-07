import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	const tmp = await mkdtemp(join(tmpdir(), 'lynx-stack-'))

	await runInRepo({
		...options,
		workspace: tmp,
		repo: 'lynx-family/lynx-stack',
		branch: process.env.LYNX_STACK_REF ?? 'main',
		beforeBuild: `rustup target add wasm32-unknown-unknown`,
		// TODO(colinaaa): enable Lynx for Web tests
		build: 'pnpm turbo build',
		test: 'pnpm run test --silent',
	})
}
