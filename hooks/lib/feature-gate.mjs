#!/usr/bin/env node
import { loadConfig } from './hook-config.mjs';

const DISABLED = 10;
const UNRESOLVED = 11;
const [projectRoot, ...featureNames] = process.argv.slice(2);
const config = projectRoot ? loadConfig(projectRoot) : null;
if (!config?.features || featureNames.length === 0) {
  process.exit(UNRESOLVED);
}

const states = featureNames.map(featureName => config.features[featureName]);
if (states.some(state => state === true)) process.exit(0);
if (states.every(state => state === false)) process.exit(DISABLED);
process.exit(UNRESOLVED);
