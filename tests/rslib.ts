import { runInRepo, $, cd } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'web-infra-dev/rslib',
		branch: process.env.RSLIB ?? 'main',
		beforeTest: async () => {
			cd('./tests')
			await $`pnpm playwright install --with-deps`
			cd('..')
		},
		test: ['test:ecosystem-ci'],
	})
}
