import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execaCommand, type Options } from 'execa'
import {
	EnvironmentData,
	Overrides,
	RepoOptions,
	RunOptions,
	Task,
} from './types'
//eslint-disable-next-line n/no-unpublished-import
import { detect, AGENTS, Agent, getCommand } from '@antfu/ni'
import actionsCore from '@actions/core'
import assert from 'assert'

const isGitHubActions = !!process.env.GITHUB_ACTIONS

let rspackPath: string
let cwd: string
let env: NodeJS.ProcessEnv

export function cd(dir: string) {
	cwd = path.resolve(cwd, dir)
}

export async function $(literals: TemplateStringsArray, ...values: any[]) {
	const cmd = literals.reduce(
		(result, current, i) =>
			result + current + (values?.[i] != null ? `${values[i]}` : ''),
		'',
	)

	const start = Date.now()
	if (isGitHubActions) {
		actionsCore.startGroup(`${cwd} $> ${cmd}`)
	} else {
		console.log(`${cwd} $> ${cmd}`)
	}

	const proc = execaCommand(cmd, {
		env,
		stdio: 'pipe',
		cwd,
		reject: false,
	})
	proc.stdin && process.stdin.pipe(proc.stdin)
	proc.stdout && proc.stdout.pipe(process.stdout)
	proc.stderr && proc.stderr.pipe(process.stderr)
	const result = await proc

	if (result.failed) {
		// simplify the error output of execa
		// https://github.com/sindresorhus/execa/blob/main/docs/errors.md
		// @ts-expect-error execa type error
		throw new Error(result.shortMessage || result.message)
	}

	if (isGitHubActions) {
		actionsCore.endGroup()
		const cost = Math.ceil((Date.now() - start) / 1000)
		console.log(`Cost for \`${cmd}\`: ${cost} s`)
	}

	return result.stdout
}

export const execa = async (cmd: string, options?: Options) => {
	const start = Date.now()
	if (isGitHubActions) {
		actionsCore.startGroup(`${cwd} $> ${cmd}`)
	} else {
		console.log(`${cwd} $> ${cmd}`)
	}

	const proc = execaCommand(cmd, {
		env,
		cwd,
		stdio: 'pipe',
		...options,
	})
	proc.stdin && process.stdin.pipe(proc.stdin)
	proc.stdout && proc.stdout.pipe(process.stdout)
	proc.stderr && proc.stderr.pipe(process.stderr)
	const result = await proc

	if (isGitHubActions) {
		actionsCore.endGroup()
		const cost = Math.ceil((Date.now() - start) / 1000)
		console.log(`Cost for \`${cmd}\`: ${cost} s`)
	}

	return result.stdout
}

export async function setupEnvironment(): Promise<EnvironmentData> {
	// @ts-expect-error import.meta
	const root = dirnameFrom(import.meta.url)
	const workspace = path.resolve(root, 'workspace')
	rspackPath = path.resolve(workspace, 'rspack')
	cwd = process.cwd()
	env = {
		...process.env,
		CI: 'true',
		TURBO_FORCE: 'true', // disable turbo caching, ecosystem-ci modifies things and we don't want replays
		YARN_ENABLE_IMMUTABLE_INSTALLS: 'false', // to avoid errors with mutated lockfile due to overrides
		NODE_OPTIONS: '--max-old-space-size=6144', // GITHUB CI has 7GB max, stay below
		ECOSYSTEM_CI: 'true', // flag for tests, can be used to conditionally skip irrelevant tests.
	}
	initWorkspace(workspace)
	return { root, workspace, rspackPath, cwd, env }
}

function initWorkspace(workspace: string) {
	if (!fs.existsSync(workspace)) {
		fs.mkdirSync(workspace, { recursive: true })
	}
	const eslintrc = path.join(workspace, '.eslintrc.json')
	if (!fs.existsSync(eslintrc)) {
		fs.writeFileSync(eslintrc, '{"root":true}\n', 'utf-8')
	}
	const editorconfig = path.join(workspace, '.editorconfig')
	if (!fs.existsSync(editorconfig)) {
		fs.writeFileSync(editorconfig, 'root = true\n', 'utf-8')
	}
}

export async function setupRepo(options: RepoOptions) {
	if (options.branch == null) {
		options.branch = 'main'
	}
	if (options.shallow == null) {
		options.shallow = true
	}

	let { repo, commit, branch, tag, dir, shallow } = options
	if (!dir) {
		throw new Error('setupRepo must be called with options.dir')
	}
	if (!repo.includes(':')) {
		repo = `https://github.com/${repo}.git`
	}

	let needClone = true
	if (fs.existsSync(dir)) {
		const _cwd = cwd
		cd(dir)
		let currentClonedRepo: string | undefined
		try {
			currentClonedRepo = await $`git ls-remote --get-url`
		} catch {
			// when not a git repo
		}
		cd(_cwd)

		if (repo === currentClonedRepo) {
			needClone = false
		} else {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	}

	if (needClone) {
		await $`git -c advice.detachedHead=false clone ${
			shallow ? '--depth=1 --no-tags' : ''
		} --branch ${tag || branch} ${repo} ${dir}`
	}
	cd(dir)
	await $`git clean -fdxq`
	await $`git fetch ${shallow ? '--depth=1 --no-tags' : '--tags'} origin ${
		tag ? `tag ${tag}` : `${commit || branch}`
	}`
	if (shallow) {
		await $`git -c advice.detachedHead=false checkout ${
			tag ? `tags/${tag}` : `${commit || branch}`
		}`
	} else {
		await $`git checkout ${branch}`
		await $`git merge FETCH_HEAD`
		if (tag || commit) {
			await $`git reset --hard ${tag || commit}`
		}
	}
	await $`git log -1 --format='%H'`
}

function toCommand(
	task: Task | Task[] | void,
	agent: Agent,
): ((scripts: any) => Promise<any>) | void {
	return async (scripts: any) => {
		const tasks = Array.isArray(task) ? task : [task]
		for (const task of tasks) {
			if (task == null || task === '') {
				continue
			} else if (typeof task === 'string') {
				const scriptOrBin = task.trim().split(/\s+/)[0]
				if (scripts?.[scriptOrBin] != null) {
					const runTaskWithAgent = getCommand(agent, 'run', [task])
					await $`${runTaskWithAgent}`
				} else {
					await $`${task}`
				}
			} else if (typeof task === 'function') {
				await task()
			} else {
				throw new Error(
					`invalid task, expected string or function but got ${typeof task}: ${task}`,
				)
			}
		}
	}
}

type RspackPackageInfo = { name: string; directory: string }

export async function getRspackPackage() {
	const {
		default: { npm, binding, packages },
	} = await import('./rspack-package.json')
	const optionalKey = `${process.platform}-${process.arch}`
	assert(
		Object.keys(npm).includes(optionalKey),
		`${optionalKey} is not supported`,
	)
	const normalizeInfo = (pkg: RspackPackageInfo) => ({
		name: pkg.name,
		directory: path.join(rspackPath, pkg.directory),
	})
	return {
		npm: npm[
			optionalKey as 'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'win32-x64'
		].map(normalizeInfo),
		binding: binding.map(normalizeInfo),
		packages: packages.map(normalizeInfo),
	}
}

export async function runInRepo(options: RunOptions & RepoOptions) {
	if (options.verify == null) {
		options.verify = true
	}
	if (options.skipGit == null) {
		options.skipGit = false
	}
	if (options.branch == null) {
		options.branch = 'main'
	}

	const {
		build,
		test,
		repo,
		branch,
		tag,
		commit,
		skipGit,
		verify,
		beforeInstall,
		afterInstall,
		beforeBuild,
		beforeTest,
	} = options

	const dir = path.resolve(
		options.workspace,
		options.dir || repo.substring(repo.lastIndexOf('/') + 1),
	)

	if (!skipGit) {
		await setupRepo({
			repo,
			dir,
			branch: options.suiteBranch ?? branch,
			tag: options.suiteTag ?? tag,
			commit: options.suiteCommit ?? commit,
		})
	} else {
		cd(dir)
	}
	if (options.agent == null) {
		const detectedAgent = await detect({ cwd: dir, autoInstall: false })
		if (detectedAgent == null) {
			throw new Error(`Failed to detect packagemanager in ${dir}`)
		}
		options.agent = detectedAgent
	}
	if (!AGENTS[options.agent]) {
		throw new Error(
			`Invalid agent ${options.agent}. Allowed values: ${Object.keys(
				AGENTS,
			).join(', ')}`,
		)
	}
	const agent = options.agent
	const beforeInstallCommand = toCommand(beforeInstall, agent)
	const afterInstallCommand = toCommand(afterInstall, agent)
	const beforeBuildCommand = toCommand(beforeBuild, agent)
	const beforeTestCommand = toCommand(beforeTest, agent)
	const buildCommand = toCommand(build, agent)
	const testCommand = toCommand(test, agent)

	const pkgFile = path.join(dir, 'package.json')
	const pkg = JSON.parse(await fs.promises.readFile(pkgFile, 'utf-8'))

	if (verify && test) {
		const frozenInstall = getCommand(agent, 'frozen')
		await $`${frozenInstall}`
		await beforeBuildCommand?.(pkg.scripts)
		await buildCommand?.(pkg.scripts)
		await beforeTestCommand?.(pkg.scripts)
		await testCommand?.(pkg.scripts)
	}
	const overrides = options.overrides || {}
	const rspackPackage = await getRspackPackage()
	const packages = [
		...(options.release ? [] : rspackPackage.npm),
		...rspackPackage.binding,
		...rspackPackage.packages,
	]
	if (options.release) {
		for (const pkg of packages) {
			if (overrides[pkg.name] && overrides[pkg.name] !== options.release) {
				throw new Error(
					`conflicting overrides[${pkg.name}]=${
						overrides[pkg.name]
					} and --release=${
						options.release
					} config. Use either one or the other`,
				)
			} else {
				overrides[pkg.name] = options.release
			}
		}
	} else {
		await patchBindingPackageJson(rspackPackage.binding)
		for (const pkg of packages) {
			overrides[pkg.name] ||= pkg.directory
		}
	}
	await applyPackageOverrides(dir, pkg, overrides, beforeInstallCommand)
	await afterInstallCommand?.(pkg.scripts)
	await beforeBuildCommand?.(pkg.scripts)
	await buildCommand?.(pkg.scripts)
	if (test) {
		await beforeTestCommand?.(pkg.scripts)
		await testCommand?.(pkg.scripts)
	}
	return { dir }
}

export async function setupRspackRepo(options: Partial<RepoOptions>) {
	const repo = options.repo || 'web-infra-dev/rspack'
	await setupRepo({
		repo,
		dir: rspackPath,
		branch: 'main',
		shallow: true,
		...options,
	})
}

export async function getPermanentRef() {
	cd(rspackPath)
	try {
		const ref = await $`git log -1 --pretty=format:%h`
		return ref
	} catch (e) {
		console.warn(`Failed to obtain perm ref. ${e}`)
		return undefined
	}
}

export async function buildRspack({ verify = false }) {
	cd(rspackPath)
	const frozenInstall = getCommand('pnpm', 'frozen')
	const runBuildBinding = getCommand('pnpm', 'run', ['build:binding:release'])
	const runMoveBinding = getCommand('pnpm', 'run', [
		'--filter @rspack/binding move-binding',
	])
	const runBuildJs = getCommand('pnpm', 'run', ['build:js'])
	await $`${frozenInstall}`
	await $`cargo codegen`
	await $`${runBuildBinding}`
	await $`${runMoveBinding}`
	await $`${runBuildJs}`
	if (verify) {
		const runTest = getCommand('pnpm', 'run', ['test:js'])
		await $`${runTest}`
	}
}

export async function bisectRspack(
	good: string,
	runSuite: () => Promise<Error | void>,
) {
	// sometimes rspack build modifies files in git, e.g. LICENSE.md
	// this would stop bisect, so to reset those changes
	const resetChanges = async () => $`git reset --hard HEAD`

	try {
		cd(rspackPath)
		await resetChanges()
		await $`git bisect start`
		await $`git bisect bad`
		await $`git bisect good ${good}`
		let bisecting = true
		while (bisecting) {
			const commitMsg = await $`git log -1 --format=%s`
			const isNonCodeCommit = commitMsg.match(/^(?:release|docs)[:(]/)
			if (isNonCodeCommit) {
				await $`git bisect skip`
				continue // see if next commit can be skipped too
			}
			const error = await runSuite()
			cd(rspackPath)
			await resetChanges()
			const bisectOut = await $`git bisect ${error ? 'bad' : 'good'}`
			bisecting = bisectOut.substring(0, 10).toLowerCase() === 'bisecting:' // as long as git prints 'bisecting: ' there are more revisions to test
		}
	} catch (e) {
		console.log('error while bisecting', e)
	} finally {
		try {
			cd(rspackPath)
			await $`git bisect reset`
		} catch (e) {
			console.log('Error while resetting bisect', e)
		}
	}
}

function isLocalOverride(v: string): boolean {
	if (!v.includes('/') || v.startsWith('@')) {
		// not path-like (either a version number or a package name)
		return false
	}
	try {
		return !!fs.lstatSync(v)?.isDirectory()
	} catch (e) {
		if (e.code !== 'ENOENT') {
			throw e
		}
		return false
	}
}

async function patchBindingPackageJson(infos: RspackPackageInfo[]) {
	for (const bindingInfo of infos) {
		const pkgJsonPath = path.join(bindingInfo.directory, 'package.json')
		const pkgJson = JSON.parse(await fs.promises.readFile(pkgJsonPath, 'utf-8'))
		delete pkgJson['optionalDependencies']
		await fs.promises.writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2))
	}
}

async function applyPackageOverrides(
	dir: string,
	pkg: any,
	overrides: Overrides = {},
	beforeInstallCommand: ((scripts: any) => Promise<any>) | void,
) {
	const useFileProtocol = (v: string) =>
		isLocalOverride(v) ? `file:${path.resolve(v)}` : v
	// remove boolean flags
	overrides = Object.fromEntries(
		Object.entries(overrides)
			//eslint-disable-next-line @typescript-eslint/no-unused-vars
			.filter(([key, value]) => typeof value === 'string')
			.map(([key, value]) => [key, useFileProtocol(value as string)]),
	)
	await $`git clean -fdxq` // remove current install

	const agent = await detect({ cwd: dir, autoInstall: false })
	if (!agent) {
		throw new Error(`failed to detect packageManager in ${dir}`)
	}
	// Remove version from agent string:
	// yarn@berry => yarn
	// pnpm@6, pnpm@7 => pnpm
	const pm = agent?.split('@')[0]

	if (pm === 'pnpm') {
		if (!pkg.devDependencies) {
			pkg.devDependencies = {}
		}
		pkg.devDependencies = {
			...pkg.devDependencies,
			...overrides, // overrides must be present in devDependencies or dependencies otherwise they may not work
		}
		if (!pkg.pnpm) {
			pkg.pnpm = {}
		}
		pkg.pnpm.overrides = {
			...pkg.pnpm.overrides,
			...overrides,
		}
	} else if (pm === 'yarn') {
		if (!pkg.devDependencies) {
			pkg.devDependencies = {}
		}
		pkg.devDependencies = {
			...pkg.devDependencies,
			...overrides, // overrides must be present in devDependencies or dependencies otherwise they may not work
		}
		pkg.resolutions = {
			...pkg.resolutions,
			...overrides,
		}
	} else if (pm === 'npm') {
		pkg.overrides = {
			...pkg.overrides,
			...overrides,
		}
		// npm does not allow overriding direct dependencies, force it by updating the blocks themselves
		for (const [name, version] of Object.entries(overrides)) {
			if (pkg.dependencies?.[name]) {
				pkg.dependencies[name] = version
			}
			if (pkg.devDependencies?.[name]) {
				pkg.devDependencies[name] = version
			}
		}
	} else {
		throw new Error(`unsupported package manager detected: ${pm}`)
	}
	const pkgFile = path.join(dir, 'package.json')
	await fs.promises.writeFile(pkgFile, JSON.stringify(pkg, null, 2), 'utf-8')

	await beforeInstallCommand?.(pkg.scripts)

	// use of `ni` command here could cause lockfile violation errors so fall back to native commands that avoid these
	if (pm === 'pnpm') {
		await $`cat package.json`
		await $`pnpm install --prefer-frozen-lockfile --prefer-offline --no-strict-peer-dependencies`
		await $`ls -il node_modules/@rspack/core/package.json ../../rspack/packages/rspack/package.json`
	} else if (pm === 'yarn') {
		await $`yarn install`
	} else if (pm === 'npm') {
		await $`npm install`
	}
}

export function dirnameFrom(url: string) {
	return path.dirname(fileURLToPath(url))
}

export function parseRspackMajor(rspackPath: string): number {
	const content = fs.readFileSync(
		path.join(rspackPath, 'packages', 'rspack', 'package.json'),
		'utf-8',
	)
	const pkg = JSON.parse(content)
	return parseMajorVersion(pkg.version)
}

export function parseMajorVersion(version: string) {
	return parseInt(version.split('.', 1)[0], 10)
}

function ignoreString(str: string | undefined, ignored: string) {
	return str !== ignored ? str : undefined
}

export function ignorePrecoded(str: string | undefined) {
	return ignoreString(str, 'precoded')
}
