import cache from '@actions/cache'
import { join } from 'node:path'
import { runInRepo, $ } from '../utils'
import { RunOptions } from '../types'

const isGitHubActions = !!process.env.GITHUB_ACTIONS

export async function test(options: RunOptions) {
	let nxCachePath: string
	let nxCacheKey: string

	await runInRepo({
		...options,
		repo: 'web-infra-dev/modern.js',
		branch: process.env.MODERN_REF ?? 'v2',
		beforeInstall: async () => {
			if (isGitHubActions) {
				const modernJsDir = join(process.cwd(), 'workspace/modernjs/modern.js')
				nxCachePath = join(modernJsDir, '.nx/cache')
				const sha = await $`git rev-parse HEAD`
				nxCacheKey = 'modernjs-nx-' + sha.trim()
				const restoreKeys = ['modernjs-nx-']
				const cacheHitKey = await cache.restoreCache(
					[nxCachePath],
					nxCacheKey,
					restoreKeys,
				)
				if (cacheHitKey) {
					console.log(`Cache hit for key: ${cacheHitKey}`)
					await $`ls -lah .nx/cache`
				} else {
					console.log(
						`Cache miss for key: ${nxCacheKey}, proceeding without cache.`,
					)
				}
			}
		},
		afterInstall: async () => {
			if (isGitHubActions) {
				console.log('Caching `.nx/cache` directory for future builds.')
				await $`ls -lah .nx/cache`
				await cache.saveCache([nxCachePath], nxCacheKey)
			}
		},
		// When using GitHub machines, installation is not necessary
		// beforeTest: async () => {
		// 	cd('tests/e2e/builder')
		// 	await $`pnpm playwright install --with-deps chromium`
		// 	cd('../../../')
		// },
		test: ['test:rspack'],
	})
}
