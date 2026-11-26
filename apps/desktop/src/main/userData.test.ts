import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { DEV_DATA_DIR_NAME, PROD_DATA_DIR_NAME, resolveUserDataDir } from './userData';

const appData = path.join('/Users/me/Library/Application Support');

describe('resolveUserDataDir', () => {
  it('development run uses its own folder next to the production one', () => {
    const dev = resolveUserDataDir({ isPackaged: false, appData, env: {} });
    expect(dev).toBe(path.join(appData, 'Product Creator Dev'));
    expect(dev).not.toBe(path.join(appData, PROD_DATA_DIR_NAME));
    expect(path.dirname(dev!)).toBe(path.dirname(path.join(appData, PROD_DATA_DIR_NAME)));
    expect(DEV_DATA_DIR_NAME).not.toBe(PROD_DATA_DIR_NAME);
  });

  it('packaged build keeps the default folder', () => {
    expect(resolveUserDataDir({ isPackaged: true, appData, env: {} })).toBeUndefined();
  });

  it('PC_USER_DATA_DIR overrides both, relative paths are resolved', () => {
    expect(resolveUserDataDir({ isPackaged: false, appData, env: { PC_USER_DATA_DIR: '/tmp/pc-test' } })).toBe('/tmp/pc-test');
    expect(resolveUserDataDir({ isPackaged: true, appData, env: { PC_USER_DATA_DIR: '/tmp/pc-test' } })).toBe('/tmp/pc-test');
    expect(resolveUserDataDir({ isPackaged: false, appData, env: { PC_USER_DATA_DIR: 'rel/dir' } })).toBe(path.resolve('rel/dir'));
    expect(resolveUserDataDir({ isPackaged: false, appData, env: { PC_USER_DATA_DIR: '  ' } })).toBe(path.join(appData, DEV_DATA_DIR_NAME));
  });

  it('respects an explicit --user-data-dir switch', () => {
    expect(resolveUserDataDir({ isPackaged: false, appData, env: {}, hasUserDataSwitch: true })).toBeUndefined();
    expect(resolveUserDataDir({ isPackaged: false, appData, env: { PC_USER_DATA_DIR: '/x' }, hasUserDataSwitch: true })).toBe('/x');
  });
});
