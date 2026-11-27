import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  buildUpdatedChangelog,
  bumpSemver,
  classifyCommitSubject,
  discoverPackageJsonPaths,
  generateChangelogEntry,
  isReleaseCommit,
  parseWorkspacePackagePatterns,
  splitChangelog,
  updateAllPackageVersions,
  validateVersion,
} from './version-manager.mjs'

describe('parseWorkspacePackagePatterns', () => {
  it('reads package globs and ignores later keys', () => {
    const yaml = `packages:
  - apps/*
  - packages/*
  - design-system

# comment
allowBuilds:
  electron: true
`
    assert.deepEqual(parseWorkspacePackagePatterns(yaml), [
      'apps/*',
      'packages/*',
      'design-system',
    ])
  })
})

describe('bumpSemver', () => {
  it('bumps patch, minor, major', () => {
    assert.equal(bumpSemver('0.1.3', 'patch'), '0.1.4')
    assert.equal(bumpSemver('0.1.3', 'minor'), '0.2.0')
    assert.equal(bumpSemver('0.1.3', 'major'), '1.0.0')
  })

  it('bumps prerelease and strips it on patch', () => {
    assert.equal(bumpSemver('0.1.3', 'prerelease'), '0.1.4-0')
    assert.equal(bumpSemver('0.1.4-0', 'prerelease'), '0.1.4-1')
    assert.equal(bumpSemver('0.1.4-1', 'patch'), '0.1.4')
  })

  it('rejects invalid bump type', () => {
    assert.throws(() => bumpSemver('1.0.0', 'nope'), /Invalid bump type/)
  })
})

describe('validateVersion', () => {
  it('accepts semver and rejects junk', () => {
    assert.equal(validateVersion('1.2.3'), true)
    assert.equal(validateVersion('1.2.3-beta.1'), true)
    assert.equal(validateVersion('not-a-version'), false)
  })
})

describe('classifyCommitSubject', () => {
  it('maps conventional commit types', () => {
    assert.equal(classifyCommitSubject('feat: add sync'), 'added')
    assert.equal(classifyCommitSubject('fix(ui): crash'), 'fixed')
    assert.equal(classifyCommitSubject('docs: update guide'), 'changed')
    assert.equal(classifyCommitSubject('security: harden token'), 'security')
    assert.equal(classifyCommitSubject('feat!: break API'), 'changed')
  })

  it('falls back to keywords', () => {
    assert.equal(classifyCommitSubject('PRODUCTCREATOR-1 added MCP tools'), 'added')
    assert.equal(classifyCommitSubject('PRODUCTCREATOR-2 fix bug in sync'), 'fixed')
    assert.equal(classifyCommitSubject('PRODUCTCREATOR-3 remove legacy'), 'removed')
  })
})

describe('isReleaseCommit', () => {
  it('detects release subjects', () => {
    assert.equal(isReleaseCommit('chore(release): 0.1.4'), true)
    assert.equal(isReleaseCommit('chore(release): v0.1.4'), true)
    assert.equal(isReleaseCommit('feat: something'), false)
  })
})

describe('changelog', () => {
  it('generates Keep a Changelog sections', () => {
    const entry = generateChangelogEntry(
      '0.1.4',
      [
        { hash: 'aaaaaaaa', subject: 'feat: new page' },
        { hash: 'bbbbbbbb', subject: 'fix: crash' },
      ],
      { date: '2026-03-27', remoteUrl: null }
    )
    assert.match(entry, /^## \[0\.1\.4\] - 2026-03-27\n/)
    assert.match(entry, /### Added\n- new page \(aaaaaaa\)/)
    assert.match(entry, /### Fixed\n- crash \(bbbbbbb\)/)
  })

  it('moves Unreleased body into the new version section', () => {
    const existing = `# Changelog

## [Unreleased]

- Manual note

## [0.1.3] - 2026-03-01

### Fixed
- old fix
`
    const next = buildUpdatedChangelog(
      existing,
      '0.1.4',
      [{ hash: 'cccccccc', subject: 'feat: ship it' }],
      { date: '2026-03-27' }
    )
    const { unreleasedBody, rest } = splitChangelog(next)
    assert.equal(unreleasedBody, '')
    assert.match(next, /## \[Unreleased\]\n\n## \[0\.1\.4\] - 2026-03-27/)
    assert.match(next, /- Manual note/)
    assert.match(next, /- ship it \(ccccccc\)/)
    assert.match(rest, /## \[0\.1\.3\] - 2026-03-01/)
  })
})

describe('workspace package sync', () => {
  it('discovers every package.json under workspace patterns', () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-version-'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', version: '0.1.3' }, null, 2) + '\n'
    )
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      `packages:\n  - apps/*\n  - packages/*\n  - design-system\n`
    )
    mkdirSync(join(root, 'apps', 'desktop'), { recursive: true })
    mkdirSync(join(root, 'apps', 'pc'), { recursive: true })
    mkdirSync(join(root, 'packages', 'core'), { recursive: true })
    mkdirSync(join(root, 'design-system'), { recursive: true })
    writeFileSync(
      join(root, 'apps', 'desktop', 'package.json'),
      JSON.stringify({ name: 'desktop', version: '0.1.3' }, null, 2) + '\n'
    )
    writeFileSync(
      join(root, 'apps', 'pc', 'package.json'),
      JSON.stringify({ name: 'pc', version: '0.1.0' }, null, 2) + '\n'
    )
    writeFileSync(
      join(root, 'packages', 'core', 'package.json'),
      JSON.stringify({ name: 'core', version: '0.1.0' }, null, 2) + '\n'
    )
    writeFileSync(
      join(root, 'design-system', 'package.json'),
      JSON.stringify({ name: 'ds', version: '0.0.0' }, null, 2) + '\n'
    )

    const paths = discoverPackageJsonPaths(root).map((p) =>
      p.slice(root.length + 1)
    )
    assert.deepEqual(paths.sort(), [
      'apps/desktop/package.json',
      'apps/pc/package.json',
      'design-system/package.json',
      'package.json',
      'packages/core/package.json',
    ])

    updateAllPackageVersions('0.1.4', root)
    for (const relativePath of paths) {
      const version = JSON.parse(
        readFileSync(join(root, relativePath), 'utf8')
      ).version
      assert.equal(version, '0.1.4', relativePath)
    }
  })
})
