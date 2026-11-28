import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEnv, runCommand, setCommandEnv } from '../src/process/command';

/** The command runner of project commands: OpenAPI generation and screenshots (PRODUCTCREATOR-23, -36) */
describe('project commands', () => {
  afterEach(() => setCommandEnv(undefined));

  it('PATH gets node_modules/.bin from the command folder up to the project root', () => {
    const env = buildEnv('/repo/apps/web', '/repo', { PATH: '/usr/bin' });
    const entries = String(env.PATH).split(path.delimiter);
    expect(entries.indexOf('/repo/apps/web/node_modules/.bin')).toBeLessThan(entries.indexOf('/repo/node_modules/.bin'));
    expect(entries).toContain('/usr/bin');
  });

  it('runs in the given folder with the login shell PATH of the app', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cmd-'));
    const cwd = path.join(root, 'svc');
    fs.mkdirSync(cwd);
    setCommandEnv({ PATH: `/login/shell/bin${path.delimiter}${process.env.PATH}` });
    const result = await runCommand({ command: 'node -e "console.log(process.cwd()); console.log(process.env.PATH)"', cwd, projectRoot: root, timeoutMs: 20000 });
    expect(result.state).toBe('ok');
    expect(result.log).toContain(fs.realpathSync(cwd));
    expect(result.log).toContain('/login/shell/bin');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
