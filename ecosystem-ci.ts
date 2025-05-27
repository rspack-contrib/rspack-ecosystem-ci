import fs from 'fs'
import path from 'path'
import process from 'process'
import { cac } from 'cac'

import {
	setupEnvironment,
	setupRspackRepo,
	buildRspack,
	bisectRspack,
	parseRspackMajor,
	parseMajorVersion,
	ignorePrecoded,
} from './utils'
import { CommandOptions, RunOptions, ShardPair } from './types'

const cli = cac()
cli
	.command('[...suites]', 'build rspack and run selected suites')
	.option('--verify', 'verify checkouts by running tests', { default: false })
	.option('--repo <repo>', 'rspack repository to use', {
		default: 'web-infra-dev/rspack',
	})
	.option('--branch <branch>', 'rspack branch to use', { default: 'main' })
	.option('--tag <tag>', 'rspack tag to use')
	.option('--commit <commit>', 'rspack commit sha to use')
	.option('--release <version>', 'rspack release to use from npm registry')
	.option('--suite-precoded', 'use precoded suite options under tests dir')
	.option('--suite-branch <branch>', 'suite branch to use')
	.option('--suite-tag <tag>', 'suite tag to use')
	.option('--suite-commit <commit>', 'suite commit sha to use')
	.action(async (suites, options: CommandOptions) => {
		const { root, rspackPath, workspace } = await setupEnvironment()
		const suitesToRun = getSuitesToRun(suites, root)
		let rspackMajor
		if (!options.release) {
			await setupRspackRepo(options)
			await buildRspack({ verify: options.verify })
			rspackMajor = parseRspackMajor(rspackPath)
		} else {
			rspackMajor = parseMajorVersion(options.release)
		}
		const runOptions: RunOptions = {
			root,
			rspackPath,
			rspackMajor,
			workspace,
			release: options.release,
			verify: options.verify,
			skipGit: false,
			suiteBranch: ignorePrecoded(options.suiteBranch),
			suiteTag: ignorePrecoded(options.suiteTag),
			suiteCommit: ignorePrecoded(options.suiteCommit),
		}
		for (const suite of suitesToRun) {
			await run(suite, runOptions)
		}
	})

cli
	.command('build-rspack', 'build rspack only')
	.option('--verify', 'verify rspack checkout by running tests', {
		default: false,
	})
	.option('--repo <repo>', 'rspack repository to use', {
		default: 'web-infra-dev/rspack',
	})
	.option('--branch <branch>', 'rspack branch to use', { default: 'main' })
	.option('--tag <tag>', 'rspack tag to use')
	.option('--commit <commit>', 'rspack commit sha to use')
	.action(async (options: CommandOptions) => {
		await setupEnvironment()
		await setupRspackRepo(options)
		await buildRspack({ verify: options.verify })
	})

cli
	.command('run-suites [...suites]', 'run single suite with pre-built rspack')
	.option(
		'--verify',
		'verify checkout by running tests before using local rspack',
		{ default: false },
	)
	.option('--repo <repo>', 'rspack repository to use', {
		default: 'web-infra-dev/rspack',
	})
	.option('--release <version>', 'rspack release to use from npm registry')
	.option('--suite-precoded', 'use precoded suite options under tests dir')
	.option('--suite-branch <branch>', 'suite branch to use')
	.option('--suite-tag <tag>', 'suite tag to use')
	.option('--suite-commit <commit>', 'suite commit sha to use')
	.option(
		'--shard <shard>',
		'Shard tests and execute only the selected shard, specify in the form "current/all". 1-based, for example "3/5"',
	)
	.action(async (suites, options: CommandOptions) => {
		const { root, rspackPath, workspace } = await setupEnvironment()
		const suitesToRun = getSuitesToRun(suites, root)
		const shardPair = options.shard ? parseShardPair(options.shard) : undefined
		const runOptions: RunOptions = {
			...options,
			root,
			rspackPath,
			rspackMajor: parseRspackMajor(rspackPath),
			workspace,
			suiteBranch: ignorePrecoded(options.suiteBranch),
			suiteTag: ignorePrecoded(options.suiteTag),
			suiteCommit: ignorePrecoded(options.suiteCommit),
			shardPair,
		}
		for (const suite of suitesToRun) {
			await run(suite, runOptions)
		}
	})

cli
	.command(
		'bisect [...suites]',
		'use git bisect to find a commit in rspack that broke suites',
	)
	.option('--good <ref>', 'last known good ref, e.g. a previous tag. REQUIRED!')
	.option('--verify', 'verify checkouts by running tests', { default: false })
	.option('--repo <repo>', 'rspack repository to use', {
		default: 'web-infra-dev/rspack',
	})
	.option('--branch <branch>', 'rspack branch to use', { default: 'main' })
	.option('--tag <tag>', 'rspack tag to use')
	.option('--commit <commit>', 'rspack commit sha to use')
	.option('--suite-precoded', 'use precoded suite options under tests dir')
	.option('--suite-branch <branch>', 'suite branch to use')
	.option('--suite-tag <tag>', 'suite tag to use')
	.option('--suite-commit <commit>', 'suite commit sha to use')
	.action(async (suites, options: CommandOptions & { good: string }) => {
		if (!options.good) {
			console.log(
				'you have to specify a known good version with `--good <commit|tag>`',
			)
			process.exit(1)
		}
		const { root, rspackPath, workspace } = await setupEnvironment()
		const suitesToRun = getSuitesToRun(suites, root)
		let isFirstRun = true
		const { verify } = options
		const runSuite = async () => {
			try {
				await buildRspack({ verify: isFirstRun && verify })
				for (const suite of suitesToRun) {
					await run(suite, {
						verify: !!(isFirstRun && verify),
						skipGit: !isFirstRun,
						root,
						rspackPath,
						rspackMajor: parseRspackMajor(rspackPath),
						workspace,
						suiteBranch: ignorePrecoded(options.suiteBranch),
						suiteTag: ignorePrecoded(options.suiteTag),
						suiteCommit: ignorePrecoded(options.suiteCommit),
					})
				}
				isFirstRun = false
				return null
			} catch (e) {
				return e
			}
		}
		await setupRspackRepo({ ...options, shallow: false })
		const initialError = await runSuite()
		if (initialError) {
			await bisectRspack(options.good, runSuite)
		} else {
			console.log(`no errors for starting commit, cannot bisect`)
		}
	})
cli.help()
cli.parse()

async function run(suite: string, options: RunOptions) {
	const { test } = await import(`./tests/${suite}.ts`)
	await test({
		...options,
		workspace: path.resolve(options.workspace, suite),
	})
}

function getSuitesToRun(suites: string[], root: string) {
	let suitesToRun: string[] = suites
	const availableSuites: string[] = fs
		.readdirSync(path.join(root, 'tests'))
		.filter((f: string) => !f.startsWith('_') && f.endsWith('.ts'))
		.map((f: string) => f.slice(0, -3))
	availableSuites.sort()
	if (suitesToRun.length === 0) {
		suitesToRun = availableSuites
	} else {
		const invalidSuites = suitesToRun.filter(
			(x) => !x.startsWith('_') && !availableSuites.includes(x),
		)
		if (invalidSuites.length) {
			console.log(`invalid suite(s): ${invalidSuites.join(', ')}`)
			console.log(`available suites: ${availableSuites.join(', ')}`)
			process.exit(1)
		}
	}
	return suitesToRun
}

const parseShardPair = (pair: string): ShardPair => {
	const shardPair = pair
		.split('/')
		.filter((d) => /^\d+$/.test(d))
		.map((d) => Number.parseInt(d, 10))
		.filter((shard) => !Number.isNaN(shard))

	const [shardIndex, shardCount] = shardPair

	if (shardPair.length !== 2) {
		throw new Error(
			'The shard option requires a string in the format of <n>/<m>.',
		)
	}

	if (shardIndex === 0 || shardCount === 0) {
		throw new Error(
			'The shard option requires 1-based values, received 0 or lower in the pair.',
		)
	}

	if (shardIndex > shardCount) {
		throw new Error(
			'The shard option <n>/<m> requires <n> to be lower or equal than <m>.',
		)
	}

	return {
		shardCount,
		shardIndex,
	}
}
