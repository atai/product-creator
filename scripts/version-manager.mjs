#!/usr/bin/env node

/**
 * Semantic version management for the Product Creator monorepo.
 *
 * Syncs every workspace package.json to one version, updates CHANGELOG.md
 * (Keep a Changelog), then creates chore(release) commit + annotated tag.
 * Does not push.
 *
 * Usage:
 *   pnpm version:patch
 *   pnpm version:minor
 *   pnpm version:major
 *   pnpm version:prerelease
 *   pnpm version:set -- 1.2.3
 *   node scripts/version-manager.mjs patch --skip-tag
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import semver from 'semver'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const CHANGELOG_PATH = join(PROJECT_ROOT, 'CHANGELOG.md')
const LOG_FORMAT = '%H|%s'

const BUMP_TYPES = ['patch', 'minor', 'major', 'prerelease']

const RELEASE_COMMIT_PATTERNS = [
  /^chore\(release\):\s*v?\d+\.\d+\.\d+/i,
  /^Update package versions to \d+\.\d+\.\d+/i,
  /^Release version \d+\.\d+\.\d+/i,
]

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`

function rel(filePath) {
  return relative(PROJECT_ROOT, filePath) || filePath
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    ...options,
  }).trim()
}

function readPackageJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writePackageJson(filePath, packageData) {
  writeFileSync(filePath, `${JSON.stringify(packageData, null, 2)}\n`, 'utf8')
}

/**
 * Parse package globs from pnpm-workspace.yaml (no YAML dependency).
 * @param {string} yamlText
 * @returns {string[]}
 */
export function parseWorkspacePackagePatterns(yamlText) {
  const patterns = []
  let inPackages = false

  for (const rawLine of yamlText.split('\n')) {
    const line = rawLine.replace(/#.*$/, '')
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (!inPackages) {
      continue
    }
    if (/^\S/.test(line)) {
      break
    }
    const match = line.match(/^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/)
    if (match) {
      patterns.push(match[1])
    }
  }

  return patterns
}

/**
 * Resolve every package.json path covered by the workspace (plus root).
 * @param {string} [root=PROJECT_ROOT]
 * @returns {string[]} absolute paths, root first
 */
export function discoverPackageJsonPaths(root = PROJECT_ROOT) {
  const paths = [join(root, 'package.json')]
  const workspacePath = join(root, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) {
    return paths
  }

  const patterns = parseWorkspacePackagePatterns(
    readFileSync(workspacePath, 'utf8')
  )

  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const dir = join(root, pattern.slice(0, -2))
      if (!existsSync(dir)) {
        continue
      }
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue
        }
        const packagePath = join(dir, entry.name, 'package.json')
        if (existsSync(packagePath)) {
          paths.push(packagePath)
        }
      }
      continue
    }

    const packagePath = join(root, pattern, 'package.json')
    if (existsSync(packagePath)) {
      paths.push(packagePath)
    }
  }

  return [...new Set(paths)]
}

export function getCurrentVersion(root = PROJECT_ROOT) {
  const packageData = readPackageJson(join(root, 'package.json'))
  return packageData.version || null
}

export function validateVersion(version) {
  return semver.valid(version) !== null
}

export function bumpSemver(currentVersion, type) {
  if (!BUMP_TYPES.includes(type)) {
    throw new Error(`Invalid bump type: ${type}`)
  }
  const next = semver.inc(currentVersion, type)
  if (!next) {
    throw new Error(
      `Failed to calculate next version from ${currentVersion} (${type})`
    )
  }
  return next
}

export function compareVersions(version1, version2) {
  return semver.compare(version1, version2)
}

export function isReleaseCommit(subject) {
  return RELEASE_COMMIT_PATTERNS.some((pattern) => pattern.test(subject))
}

/**
 * Classify a commit subject into Keep a Changelog section.
 * Prefer Conventional Commits types (emperor style); fall back to keywords.
 * @param {string} subject
 * @returns {'added'|'changed'|'fixed'|'removed'|'security'}
 */
export function classifyCommitSubject(subject) {
  const breaking =
    /\bBREAKING CHANGE\b/i.test(subject) ||
    /^[a-z]+(?:\([^)]*\))?!:/i.test(subject)
  if (breaking) {
    return 'changed'
  }

  const match = subject.match(/^([a-z]+)(?:\(([^)]*)\))?(!)?:\s*/i)
  const type = match ? match[1].toLowerCase() : null
  const scope = match && match[2] ? match[2].toLowerCase() : null

  if (type === 'security' || scope === 'security') {
    return 'security'
  }
  if (type === 'feat') {
    return 'added'
  }
  if (type === 'fix') {
    return 'fixed'
  }
  if (type === 'remove') {
    return 'removed'
  }
  if (
    type === 'perf' ||
    type === 'refactor' ||
    type === 'docs' ||
    type === 'chore' ||
    type === 'style' ||
    type === 'test' ||
    type === 'build' ||
    type === 'ci' ||
    type === 'revert'
  ) {
    return 'changed'
  }

  const lower = subject.toLowerCase()
  if (/\badd(ed|ing|s)?\b/.test(lower)) {
    return 'added'
  }
  if (/\bbug\b/.test(lower)) {
    return 'fixed'
  }
  if (/\bsecurity\b/.test(lower)) {
    return 'security'
  }
  if (/\b(remove|removed|removing|delete|deleted|deleting)\b/.test(lower)) {
    return 'removed'
  }
  return 'changed'
}

function formatChangelogBullet(subject) {
  const withoutPrefix = subject.replace(/^[a-z]+(\([^)]*\))?(!)?:\s*/i, '')
  return withoutPrefix || subject
}

function resolveRemoteUrl(remoteUrl) {
  if (!remoteUrl) {
    return null
  }
  let url = remoteUrl.trim()
  if (url.startsWith('git@')) {
    url = url.replace(':', '/').replace('git@', 'https://')
  }
  return url.replace(/\.git$/, '')
}

function formatCommitLine(commit, remoteUrl) {
  const shortHash = commit.hash.slice(0, 7)
  const text = formatChangelogBullet(commit.subject)
  let suffix = ` (${shortHash})`
  if (remoteUrl) {
    suffix = ` ([${shortHash}](${remoteUrl}/commit/${commit.hash}))`
  }
  return `- ${text}${suffix}`
}

/**
 * @param {string} version
 * @param {{hash: string, subject: string}[]} commits
 * @param {{remoteUrl?: string|null, date?: string}} [options]
 */
export function generateChangelogEntry(version, commits, options = {}) {
  const date = options.date || new Date().toISOString().split('T')[0]
  const remoteUrl = resolveRemoteUrl(options.remoteUrl)
  const sections = {
    added: [],
    changed: [],
    fixed: [],
    removed: [],
    security: [],
  }

  for (const commit of commits) {
    sections[classifyCommitSubject(commit.subject)].push(
      formatCommitLine(commit, remoteUrl)
    )
  }

  let entry = `## [${version}] - ${date}\n\n`
  const sectionTitles = {
    added: 'Added',
    changed: 'Changed',
    fixed: 'Fixed',
    removed: 'Removed',
    security: 'Security',
  }

  for (const [key, title] of Object.entries(sectionTitles)) {
    if (sections[key].length === 0) {
      continue
    }
    entry += `### ${title}\n`
    entry += `${sections[key].join('\n')}\n\n`
  }

  return entry
}

/**
 * Split changelog into preamble, Unreleased body, and remaining release sections.
 * @param {string} content
 * @returns {{preamble: string, unreleasedBody: string, rest: string}}
 */
export function splitChangelog(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  const unreleasedRe = /^## \[Unreleased\][^\n]*\n/m
  const match = unreleasedRe.exec(normalized)
  if (!match) {
    const firstRelease = /^## \[/m.exec(normalized)
    const preamble = firstRelease
      ? normalized.slice(0, firstRelease.index)
      : normalized
    const rest = firstRelease ? normalized.slice(firstRelease.index) : ''
    return { preamble, unreleasedBody: '', rest }
  }
  const afterHeading = normalized.slice(match.index + match[0].length)
  const nextRelease = /^## \[/m.exec(afterHeading)
  const unreleasedBody = (
    nextRelease ? afterHeading.slice(0, nextRelease.index) : afterHeading
  )
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
  const rest = nextRelease ? afterHeading.slice(nextRelease.index) : ''
  return {
    preamble: normalized.slice(0, match.index),
    unreleasedBody,
    rest,
  }
}

/**
 * Insert a version section after ## [Unreleased], preserving historical releases.
 * @param {string} existingContent
 * @param {string} version
 * @param {{hash: string, subject: string}[]} commits
 * @param {{remoteUrl?: string|null, date?: string}} [options]
 */
export function buildUpdatedChangelog(
  existingContent,
  version,
  commits,
  options = {}
) {
  const { unreleasedBody, rest } = splitChangelog(existingContent || '')
  const generated = generateChangelogEntry(version, commits, options)
  let versionBlock = generated
  if (unreleasedBody) {
    const nl = generated.indexOf('\n\n')
    const heading = nl === -1 ? generated.trimEnd() : generated.slice(0, nl)
    const groups = nl === -1 ? '' : generated.slice(nl + 2)
    versionBlock = `${heading}\n\n${unreleasedBody}\n\n${groups}`
  }
  return `${CHANGELOG_HEADER}\n## [Unreleased]\n\n${versionBlock}${rest}`
}

/**
 * Write the same version into every discovered package.json.
 * @param {string} newVersion
 * @param {string} [root=PROJECT_ROOT]
 * @returns {string[]} absolute paths written
 */
export function updateAllPackageVersions(newVersion, root = PROJECT_ROOT) {
  const paths = discoverPackageJsonPaths(root)
  const written = []

  for (const packagePath of paths) {
    const packageData = readPackageJson(packagePath)
    const oldVersion = packageData.version || '0.0.0'
    packageData.version = newVersion
    writePackageJson(packagePath, packageData)
    console.log(
      `  ${relative(root, packagePath) || packagePath}: ${oldVersion} → ${newVersion}`
    )
    written.push(packagePath)
  }

  return written
}

function assertGitReadyForBump() {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      stdio: 'ignore',
      cwd: PROJECT_ROOT,
    })
  } catch {
    console.error('Not a git repository. Refusing to bump version.')
    process.exit(1)
  }

  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', 'HEAD'], {
      stdio: 'ignore',
      cwd: PROJECT_ROOT,
    })
  } catch {
    console.error(
      'No commits yet (missing HEAD). Create an initial commit before bumping version.'
    )
    process.exit(1)
  }

  const status = runGit(['status', '--porcelain'])
  if (status.length > 0) {
    console.error(
      'Working tree is not clean. Commit or stash changes before bumping version:'
    )
    console.error(status)
    process.exit(1)
  }
}

function tagExists(tagName) {
  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`], {
      stdio: 'ignore',
      cwd: PROJECT_ROOT,
    })
    return true
  } catch {
    return false
  }
}

function getLatestVersionTag() {
  try {
    return execFileSync(
      'git',
      ['describe', '--tags', '--match', 'v*', '--abbrev=0'],
      {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim()
  } catch {
    return null
  }
}

function findLatestReleaseCommit() {
  try {
    const output = runGit(['log', `--format=${LOG_FORMAT}`, '-n', '500'])
    if (!output) {
      return null
    }
    for (const line of output.split('\n')) {
      const separator = line.indexOf('|')
      if (separator === -1) {
        continue
      }
      const hash = line.slice(0, separator)
      const subject = line.slice(separator + 1)
      if (isReleaseCommit(subject)) {
        return hash
      }
    }
  } catch {
    return null
  }
  return null
}

function getReleaseAnchor(currentVersion) {
  const preferredTag = `v${currentVersion}`
  if (tagExists(preferredTag)) {
    return { ref: preferredTag, type: 'tag' }
  }

  const latestTag = getLatestVersionTag()
  if (latestTag) {
    return { ref: latestTag, type: 'tag' }
  }

  const releaseCommit = findLatestReleaseCommit()
  if (releaseCommit) {
    return { ref: releaseCommit, type: 'commit' }
  }

  return { ref: null, type: 'root' }
}

function parseCommitLine(line) {
  const separator = line.indexOf('|')
  if (separator === -1) {
    return null
  }
  const hash = line.slice(0, separator)
  const subject = line.slice(separator + 1)
  if (!hash || !subject || isReleaseCommit(subject)) {
    return null
  }
  return { hash, subject }
}

function getCommitsSinceRelease(currentVersion) {
  const anchor = getReleaseAnchor(currentVersion)
  const range = anchor.ref ? `${anchor.ref}..HEAD` : 'HEAD'
  const output = runGit(['log', range, `--format=${LOG_FORMAT}`, '--no-merges'])
  if (!output) {
    return []
  }
  return output.split('\n').map(parseCommitLine).filter(Boolean)
}

function assertHasReleaseableCommits(commits) {
  if (commits.length === 0) {
    console.error('No commits since last release. Nothing to bump.')
    process.exit(1)
  }
}

function getRemoteOriginUrl() {
  try {
    return runGit(['remote', 'get-url', 'origin'])
  } catch {
    return null
  }
}

function writeChangelog(version, commits, remoteUrl) {
  const existing = existsSync(CHANGELOG_PATH)
    ? readFileSync(CHANGELOG_PATH, 'utf8')
    : ''
  const next = buildUpdatedChangelog(existing, version, commits, { remoteUrl })
  writeFileSync(
    CHANGELOG_PATH,
    next.endsWith('\n') ? next : `${next}\n`,
    'utf8'
  )
  console.log(`Updated CHANGELOG.md for ${version}`)
  return CHANGELOG_PATH
}

function commitRelease(version, pathsToStage) {
  const uniquePaths = [
    ...new Set(pathsToStage.filter((p) => existsSync(p)).map((p) => rel(p))),
  ]
  if (uniquePaths.length === 0) {
    console.error('No version files to commit.')
    process.exit(1)
  }

  execFileSync('git', ['add', '--', ...uniquePaths], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  })
  execFileSync('git', ['commit', '-m', `chore(release): ${version}`], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  })
  console.log(`Committed chore(release): ${version}`)
}

function createAnnotatedTag(version) {
  const tagName = `v${version}`
  if (tagExists(tagName)) {
    console.error(`Tag ${tagName} already exists. Refusing to overwrite.`)
    process.exit(1)
  }
  execFileSync(
    'git',
    ['tag', '-a', tagName, '-m', `Release version ${version}`],
    {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    }
  )
  console.log(`Created annotated git tag: ${tagName}`)
}

function performReleaseBump(newVersion, options) {
  const currentVersion = getCurrentVersion()
  if (!currentVersion || !validateVersion(currentVersion)) {
    console.error(`Current version is not valid semver: ${currentVersion}`)
    process.exit(1)
  }

  assertGitReadyForBump()

  const commits = getCommitsSinceRelease(currentVersion)
  assertHasReleaseableCommits(commits)
  console.log(`Found ${commits.length} commit(s) since last release\n`)

  if (!options.skipTag && tagExists(`v${newVersion}`)) {
    console.error(`Tag v${newVersion} already exists. Refusing to bump.`)
    process.exit(1)
  }

  console.log(`Bumping version: ${currentVersion} → ${newVersion}`)
  console.log('Updating package.json files:')
  const touched = updateAllPackageVersions(newVersion)

  if (!options.noChangelog) {
    console.log('\nUpdating CHANGELOG.md...')
    touched.push(writeChangelog(newVersion, commits, getRemoteOriginUrl()))
  } else {
    console.log('Skipping changelog (--no-changelog)')
  }

  if (options.skipCommit) {
    console.log(
      'Skipped release commit (--skip-commit). Tag not created; commit manually, then tag.'
    )
    console.log(`\nVersion files updated to ${newVersion}`)
    return
  }

  console.log('\nCreating release commit...')
  commitRelease(newVersion, touched)

  if (!options.skipTag) {
    createAnnotatedTag(newVersion)
  } else {
    console.log('Skipped git tag (--skip-tag)')
  }

  console.log(`\nVersion bump completed: ${currentVersion} → ${newVersion}`)
  console.log('Next: git push && git push --tags')
}

function showVersionStatus() {
  const rootVersion = getCurrentVersion()
  console.log(`Root version: ${rootVersion}`)
  console.log('')

  const paths = discoverPackageJsonPaths()
  let drift = 0
  for (const packagePath of paths) {
    const packageData = readPackageJson(packagePath)
    const version = packageData.version || '(missing)'
    const mark = version === rootVersion ? 'OK' : 'DRIFT'
    if (mark === 'DRIFT') {
      drift++
    }
    console.log(`  [${mark}] ${rel(packagePath)}: ${version}`)
  }

  if (existsSync(CHANGELOG_PATH)) {
    console.log(`  CHANGELOG.md: present`)
  } else {
    console.log(`  CHANGELOG.md: missing (created on next bump)`)
  }

  if (drift > 0) {
    console.log(
      `\n${drift} package(s) differ from root. The next pnpm version:* will sync them.`
    )
  } else {
    console.log('\nAll package.json versions match the root.')
  }
}

function showHelp() {
  console.log(`
Product Creator Version Manager

Semver release hygiene: clean working tree, commits since last release,
sync every workspace package.json, CHANGELOG (Keep a Changelog), then
chore(release) commit + annotated tag. Does not push.

Usage: node scripts/version-manager.mjs [command] [options]

Commands:
  current                Show current (root) version
  status                 Show version across all workspace package.json files
  major                  Bump major version (X.0.0)
  minor                  Bump minor version (0.X.0)
  patch                  Bump patch version (0.0.X)
  prerelease             Bump prerelease (0.0.X-0, then -1, …)
  set <version>          Set specific version (same release flow)
  help                   Show this help

Options:
  --skip-tag             Skip annotated git tag
  --skip-commit          Update files only (no commit, no tag)
  --no-changelog         Skip CHANGELOG update

Examples:
  pnpm version:current
  pnpm version:status
  pnpm version:patch
  pnpm version:minor -- --skip-tag
  pnpm version:set -- 1.2.3
`)
}

function parseOptions(args) {
  return {
    skipTag: args.includes('--skip-tag'),
    skipCommit: args.includes('--skip-commit'),
    noChangelog: args.includes('--no-changelog'),
  }
}

function filterFlags(args) {
  return args.filter((arg) => !arg.startsWith('--'))
}

function main() {
  const rawArgs = process.argv.slice(2)
  if (
    rawArgs.includes('--help') ||
    rawArgs.includes('-h') ||
    rawArgs[0] === 'help' ||
    !rawArgs[0]
  ) {
    showHelp()
    return
  }

  const options = parseOptions(rawArgs)
  const args = filterFlags(rawArgs)
  const command = args[0]

  try {
    switch (command) {
      case 'current': {
        console.log(`Current version: ${getCurrentVersion()}`)
        break
      }

      case 'status': {
        showVersionStatus()
        break
      }

      case 'major':
      case 'minor':
      case 'patch':
      case 'prerelease': {
        const current = getCurrentVersion()
        if (!current || !validateVersion(current)) {
          console.error(`Current version is not valid semver: ${current}`)
          process.exit(1)
        }
        const next = bumpSemver(current, command)
        performReleaseBump(next, options)
        break
      }

      case 'set': {
        const version = args[1]
        if (!version) {
          console.error('Usage: pnpm version:set -- <version>')
          process.exit(1)
        }
        if (!validateVersion(version)) {
          console.error(`Invalid semantic version: ${version}`)
          process.exit(1)
        }
        const current = getCurrentVersion()
        if (current && compareVersions(version, current) <= 0) {
          console.error(
            `New version ${version} must be greater than current version ${current}`
          )
          process.exit(1)
        }
        performReleaseBump(version, options)
        break
      }

      default: {
        console.error(`Unknown command: ${command}`)
        showHelp()
        process.exit(1)
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  try {
    return import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
}

if (isDirectRun()) {
  main()
}
