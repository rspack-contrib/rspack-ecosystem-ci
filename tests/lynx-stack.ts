import fs from 'node:fs'
import path from 'node:path'

import { runInRepo, $ } from '../utils'
import { RunOptions } from '../types'

export async function test(options: RunOptions) {
	await runInRepo({
		...options,
		// TODO: debug only, should change to lynx-family/lynx-stack
		repo: 'colinaaa/lynx-stack',
		branch: process.env.LYNX_STACK_REF ?? 'colin/0404/uqr',
		async beforeInstall() {
			const lynxStackDir = path.resolve(process.cwd(), 'workspace/lynx-stack')
			const packageJsonPath = path.join(lynxStackDir, 'package.json')
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

			// Copy Rspack version from pnpm overrides to devDependencies
			// lynx-stack would override the rspack version to the version in devDependencies using "overrides."
			if (packageJson.pnpm?.overrides?.['@rspack/core']) {
				packageJson.devDependencies = packageJson.devDependencies || {}
				packageJson.devDependencies['@rspack/core'] =
					packageJson.pnpm.overrides['@rspack/core']
				fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
			}
		},
		beforeBuild: `rustup target add wasm32-unknown-unknown`,
		// TODO(colinaaa): enable Lynx for Web tests
		build: 'pnpm turbo build',
		test: 'test',
	})
}
