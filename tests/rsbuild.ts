import { runInRepo, $, cd } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'web-infra-dev/rsbuild',
		branch: process.env.RSBUILD_REF ?? 'main',
		beforeTest: async () => {
			cd('./e2e')
			await $`pnpm playwright install`
			cd('..')
		},
		test: ['e2e:rspack'],
	})
}
