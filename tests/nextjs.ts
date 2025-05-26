import path from 'path'
import fs from 'fs';
import { runInRepo, execa } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	const { workspace, shardPair, rspackPath } = options;
	const rspackCorePath = path.join(rspackPath, 'packages/rspack');

	await runInRepo({
		...options,
		repo: 'vercel/next.js',
		branch: 'canary',
		build: ['build'],
		beforeTest: async () => {
			const nextRspackPath = path.join(workspace, 'next.js/packages/next-rspack');
			const nextRspackPkgPath = path.join(nextRspackPath, 'package.json');
			const pkg = JSON.parse(fs.readFileSync(nextRspackPkgPath, 'utf-8'));
			pkg.dependencies['@rspack/core'] = `${rspackCorePath}`;
			fs.writeFileSync(nextRspackPkgPath, JSON.stringify(pkg, null, 2));
		},
		test: async () => {
			const env = {
				...process.env,
				NEXT_EXTERNAL_TESTS_FILTERS: `${workspace}/next.js/test/rspack-build-tests-manifest.json`,
				NEXT_RSPACK: '1',
				NEXT_TEST_USE_RSPACK: '1',
			};
			if (shardPair) {
				await execa(`node run-tests.js -g ${ shardPair.shardIndex }/${ shardPair.shardCount } --type production`, {
					env,
					shell: true,
				})
			} else {
				await execa('node run-tests.js --type production', {
					env,
					shell: true,
				})
			}
		},
	})
}
