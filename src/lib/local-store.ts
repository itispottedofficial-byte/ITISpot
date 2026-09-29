import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Spot } from './types';
interface State { spots: Spot[]; limits: Record<string, { count: number; reset: number }> }
const g = globalThis as typeof globalThis & { itispotQueue?: Promise<unknown> };
export const dataDir = () => path.resolve(process.env.DATA_DIR || '.data');
export async function localTransaction<T>(work: (data: State) => T | Promise<T>): Promise<T> {
  const task = (g.itispotQueue || Promise.resolve()).catch(() => {}).then(async () => {
    await mkdir(dataDir(), { recursive: true, mode: 0o700 });
    const dest = path.join(dataDir(), 'store.json');
    let state: State;
    try { state = JSON.parse(await readFile(dest, 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; state = { spots: [], limits: {} }; }
    const result = await work(state);
    await writeFile(dest + '.tmp', JSON.stringify(state), { mode: 0o600 });
    await rename(dest + '.tmp', dest);
    return result;
  });
  g.itispotQueue = task;
  return task;
}
