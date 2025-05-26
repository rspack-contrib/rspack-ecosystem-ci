import path from 'path'
import fs from 'fs';
import { runInRepo, execa, $, cd } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	const { workspace, shardPair, rspackPath } = options;

	await runInRepo({
		...options,
		repo: 'vercel/next.js',
		branch: 'canary',
		build: async () => {
			const rspackCorePath = path.join(rspackPath, 'packages/rspack');
			const nextWorkspaceDir = path.join(workspace, 'next.js');

			const getRspackPath = path.join(nextWorkspaceDir, 'packages/next/src/shared/lib/get-rspack.ts');
			const getRspackContent = fs.readFileSync(getRspackPath, 'utf-8');
			const replacedGetRspackContent = getRspackContent.replace("require.resolve('@rspack/core'", `require.resolve('${rspackCorePath}'`);
			fs.writeFileSync(getRspackPath, replacedGetRspackContent);

			const compiledWebpackPath = path.join(nextWorkspaceDir, 'packages/next/src/compiled/webpack/webpack.js');
			const compiledWebpackContent = fs.readFileSync(compiledWebpackPath, 'utf-8');
			const replacedCompiledWebpackContent = compiledWebpackContent.replace("require('@rspack/core')", `require('${rspackCorePath}')`);
			fs.writeFileSync(compiledWebpackPath, replacedCompiledWebpackContent);

			const nodeBindingPath = path.join(rspackPath, 'crates/node_binding');
			cd(nodeBindingPath);
			await $`pnpm run move-binding`;

			cd(nextWorkspaceDir);
			await $`pnpm run build`
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
