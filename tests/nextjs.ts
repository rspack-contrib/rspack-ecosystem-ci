import { runInRepo, execa } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		repo: 'vercel/next.js',
		branch: 'main',
		build: ['build'],
		test: async () => {
			const env = {
				...process.env,
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
