import { join, resolve, parse } from 'path'

const { GITHUB_REPOSITORY, RUNNER_TOOL_CACHE } = process.env
const CWD = process.cwd()

export const STRATEGIES = ['copy-immutable', 'copy', 'move'] as const
export type Strategy = (typeof STRATEGIES)[number]

export type Vars = {
	cacheDir: string
	cachePath: string
	options: {
		key: string
		path: string
		strategy: Strategy
	}
	targetDir: string
	targetPath: string
}

export const getVars = (
	path: string,
	strategy: Strategy = 'move',
	key = 'no-key',
): Vars => {
	if (!RUNNER_TOOL_CACHE) {
		throw new TypeError(
			'Expected RUNNER_TOOL_CACHE environment variable to be defined.',
		)
	}

	if (!GITHUB_REPOSITORY) {
		throw new TypeError(
			'Expected GITHUB_REPOSITORY environment variable to be defined.',
		)
	}

	const options = {
		key,
		path,
		strategy,
	}

	if (!options.path) {
		throw new TypeError('path is required but was not provided.')
	}

	if (!Object.values(STRATEGIES).includes(options.strategy)) {
		throw new TypeError(`Unknown strategy ${options.strategy}`)
	}

	const cacheDir = join(RUNNER_TOOL_CACHE, GITHUB_REPOSITORY, options.key)
	const cachePath = join(cacheDir, options.path)
	const targetPath = resolve(CWD, options.path)
	const { dir: targetDir } = parse(targetPath)

	return {
		cacheDir,
		cachePath,
		options,
		targetDir,
		targetPath,
	}
}
