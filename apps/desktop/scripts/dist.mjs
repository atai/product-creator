#!/usr/bin/env node
/**
 * electron-builder wrapper (PRODUCTCREATOR-21): signs and notarizes when credentials are available,
 * otherwise builds unsigned and says exactly what is missing. Extra arguments go to electron-builder
 * (e.g. `--dir`, `--publish never`).
 *
 * macOS signing:   CSC_LINK + CSC_KEY_PASSWORD (.p12 "Developer ID Application"), or that identity in
 *                  the login keychain (local builds). CSC_IDENTITY_AUTO_DISCOVERY=false or
 *                  PC_UNSIGNED=1 forces an unsigned build.
 * notarization:    APPLE_API_KEY (path to .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER, or
 *                  APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_KEYCHAIN_PROFILE.
 * Windows signing: WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (or CSC_LINK + CSC_KEY_PASSWORD).
 * PC_REQUIRE_SIGNING=1 turns every fallback into an error (release builds that must be signed).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const has = (...names) => names.every((name) => Boolean(env[name]?.trim()));
const truthy = (value) => ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());
const requireSigning = truthy(env.PC_REQUIRE_SIGNING);
const args = process.argv.slice(2);
const missing = [];

function note(level, message) {
  console.log(`[dist] ${level}: ${message}`);
  // GitHub Actions annotation + job summary
  if (env.GITHUB_ACTIONS) {
    console.log(`::${level === 'warning' ? 'warning' : 'notice'}::${message}`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `- **${level}**: ${message}\n`);
  }
}

function keychainDeveloperId() {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
    return /"Developer ID Application: [^"]+"/.exec(out)?.[0]?.slice(1, -1) ?? null;
  } catch {
    return null;
  }
}

if (process.platform === 'darwin') {
  const forcedUnsigned = truthy(env.PC_UNSIGNED) || env.CSC_IDENTITY_AUTO_DISCOVERY === 'false';
  let signed = false;
  if (forcedUnsigned && !has('CSC_LINK')) {
    note('notice', 'macOS: unsigned build requested (PC_UNSIGNED / CSC_IDENTITY_AUTO_DISCOVERY=false)');
  } else if (has('CSC_LINK')) {
    if (!has('CSC_KEY_PASSWORD')) missing.push('CSC_KEY_PASSWORD (MAC_CSC_KEY_PASSWORD secret)');
    signed = true;
    note('notice', 'macOS: signing with the certificate from CSC_LINK');
  } else {
    const identity = keychainDeveloperId();
    if (identity) {
      signed = true;
      // pin the Developer ID identity: auto-discovery could pick "Apple Development", which Apple rejects
      args.push(`-c.mac.identity=${identity.replace(/^Developer ID Application: /, '')}`);
      note('notice', `macOS: signing with keychain identity "${identity}"`);
    } else {
      missing.push('MAC_CSC_LINK + MAC_CSC_KEY_PASSWORD (Developer ID Application .p12), or that identity in the keychain');
    }
  }
  if (!signed) {
    args.push('-c.mac.identity=null', '-c.mac.notarize=false');
    note('warning', 'macOS: building UNSIGNED and not notarized');
  } else if (has('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER')) {
    note('notice', 'macOS notarization: App Store Connect API key');
  } else if (has('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID')) {
    note('notice', 'macOS notarization: Apple ID + app-specific password');
  } else if (has('APPLE_KEYCHAIN_PROFILE')) {
    note('notice', `macOS notarization: notarytool keychain profile "${env.APPLE_KEYCHAIN_PROFILE}"`);
  } else {
    args.push('-c.mac.notarize=false');
    missing.push('APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER (or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_KEYCHAIN_PROFILE)');
    note('warning', 'macOS: signed but NOT notarized — Gatekeeper will warn after download');
  }
} else if (process.platform === 'win32') {
  if (truthy(env.PC_UNSIGNED) || env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    note('notice', 'Windows: unsigned build requested (PC_UNSIGNED / CSC_IDENTITY_AUTO_DISCOVERY=false)');
  } else if (has('WIN_CSC_LINK') || has('CSC_LINK')) {
    note('notice', 'Windows: signing with the certificate from WIN_CSC_LINK / CSC_LINK');
  } else {
    missing.push('WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (code signing .pfx)');
    note('warning', 'Windows: building UNSIGNED (SmartScreen will warn)');
  }
}

if (missing.length) {
  note('warning', `missing for a fully signed build: ${missing.join('; ')}`);
  if (requireSigning) {
    console.error('[dist] PC_REQUIRE_SIGNING is set — refusing to build without signing/notarization');
    process.exit(1);
  }
}

if (!args.some((arg) => arg.startsWith('--publish') || arg === '-p')) args.push('--publish', 'never');
const bin = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
const result = spawnSync(bin, args, { cwd: appDir, stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
