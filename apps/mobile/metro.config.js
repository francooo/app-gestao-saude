// Metro configurado para monorepo: precisa enxergar a raiz do workspace
// para resolver @gestao/shared.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Observar todo o monorepo, para hot reload ao editar packages/shared.
config.watchFolders = [workspaceRoot];

// 2. Resolver modulos tanto no app quanto na raiz, onde o pnpm instala com
//    node-linker=hoisted (ver .npmrc).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Nota: NAO definir resolver.disableHierarchicalLookup aqui.
// E a receita padrao para monorepos com pnpm em modo isolado, mas com
// node-linker=hoisted tudo ja esta na raiz e a busca hierarquica funciona.
// O expo-doctor sinaliza a alteracao como arriscada, e de fato ela so
// esconderia pacotes que o Metro deveria encontrar sozinho.

module.exports = config;
