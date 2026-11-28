import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseProjectArgs } from './args';

describe('project folders from the command line', () => {
  it('opens the folders given together (dev: --project; packaged: positional), relative to where it was started', () => {
    expect(parseProjectArgs(['electron', '.', '--project', 'a', '--project=b'], {}, '/home/u')).toEqual([path.resolve('/home/u/a'), path.resolve('/home/u/b')]);
    expect(parseProjectArgs(['Product Creator', '/x/a', '/x/b'], {}, '/home/u', { packaged: true })).toEqual(['/x/a', '/x/b']);
    expect(parseProjectArgs(['electron', '.', '--project', 'repo'], { INIT_CWD: '/work' }, '/elsewhere')).toEqual([path.resolve('/work/repo')]);
  });

  it('nothing given: PC_PROJECT, otherwise none (the launcher passes the current folder)', () => {
    expect(parseProjectArgs(['electron', '.'], { PC_PROJECT: `/p1${path.delimiter}/p2` }, '/')).toEqual(['/p1', '/p2']);
    expect(parseProjectArgs(['electron', '.'], {}, '/')).toEqual([]);
  });
});
