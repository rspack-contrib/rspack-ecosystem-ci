import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'web-infra-dev/rspack-plugin-ci',
		branch: 'main',
		test: ['test'],
	})
}
