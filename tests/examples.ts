import { runInRepo } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'rspack-contrib/rspack-examples',
		branch: 'main',
		test: [
			'build:rspack',
			'test:rspack',
			'build:rsbuild',
			'build:rsdoctor',
			'build:rspress',
		],
	})
}
