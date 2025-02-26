import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'rspack-contrib/rspack-plugin-ci',
		branch: 'main',
		test: ['test'],
	})
}
