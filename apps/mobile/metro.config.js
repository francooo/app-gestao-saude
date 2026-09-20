// Metro configurado para monorepo: precisa enxergar a raiz do workspace
// para resolver @gestao/shared e o node_modules hoisted.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Observar todo o monorepo, para hot reload ao editar packages/shared.
config.watchFolders = [workspaceRoot];

// 2. Resolver modulos tanto no app quanto na raiz (onde o pnpm hoisted instala).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Nao subir a arvore procurando node_modules fora das pastas acima.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
