import { type Configuration, migrate } from '@wic/core';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveConfiguration(config: Configuration) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }), `walk-in-${stamp}.json`);
}

/** Opens a file picker and resolves with a migrated configuration. */
export function openConfiguration(): Promise<Configuration> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file chosen.'));
      try {
        resolve(migrate(JSON.parse(await file.text())));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('That file could not be read.'));
      }
    };
    input.click();
  });
}
