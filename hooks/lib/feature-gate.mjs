#!/usr/bin/env node
import { loadConfig } from './hook-config.mjs';

const [projectRoot, ...featureNames] = process.argv.slice(2);
const config = projectRoot ? loadConfig(projectRoot) : null;
const enabled = featureNames.some(
  featureName => config?.features?.[featureName] === true,
);

process.exit(enabled ? 0 : 1);
