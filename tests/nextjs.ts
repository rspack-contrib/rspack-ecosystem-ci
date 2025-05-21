import { runInRepo, execa } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	const { workspace, shardPair } = options;

	await runInRepo({
		...options,
		repo: 'vercel/next.js',
		branch: 'canary',
		build: ['build'],
		test: async () => {
			const env = {
				...process.env,
				NEXT_EXTERNAL_TESTS_FILTERS: `${workspace}/next.js/test/rspack-build-tests-manifest.json`,
				NEXT_RSPACK: '1',
				NEXT_TEST_USE_RSPACK: '1',
			};
			if (shardPair) {
				await execa(`node run-tests.js --timings -g ${ shardPair } --type production`, {
					env,
					shell: true,
				})
			} else {
				await execa('node run-tests.js --timings --type production', {
					env,
					shell: true,
				})
			}
		},
	})
}
