import { runInRepo, execa } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	const pwd = options.workspace;
	await runInRepo({
		...options,
		repo: 'vercel/next.js',
		branch: 'main',
		build: ['build'],
		test: async () => {
			const env = {
				...process.env,
				NEXT_EXTERNAL_TESTS_FILTERS: `${pwd}/test/rspack-build-tests-manifest.json`,
				NEXT_RSPACK: '1',
				NEXT_TEST_USE_RSPACK: '1',
			};
			await execa('node run-tests.js --timings --type production', {
				env,
				shell: true,
			})
		},
	})
}
