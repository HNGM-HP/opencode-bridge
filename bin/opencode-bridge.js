#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const passthroughArgs = [];
let configDir = '';

for (let index = 0; index < argv.length; index += 1) {
  const current = argv[index];
  if (current === '--config-dir') {
    configDir = argv[index + 1] || '';
    index += 1;
    continue;
  }

  if (current.startsWith('--config-dir=')) {
    configDir = current.slice('--config-dir='.length);
    continue;
  }

  passthroughArgs.push(current);
}

if (configDir) {
  process.env.OPENCODE_BRIDGE_CONFIG_DIR = path.resolve(configDir);
} else if (!process.env.OPENCODE_BRIDGE_CONFIG_DIR && !process.env.OPENCODE_BRIDGE_ENV_FILE) {
  process.env.OPENCODE_BRIDGE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode-bridge');
}

process.argv = [process.argv[0], process.argv[1], ...passthroughArgs];

await import('../dist/index.js');
