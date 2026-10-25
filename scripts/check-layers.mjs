import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve('src');

const RULES = {
  presentation: {
    forbidden: [
      { pattern: /@data|\/data\//, rule: 'presentation no puede importar data' },
      { pattern: /@supabase\//, rule: 'presentation no puede importar @supabase/*' },
      { pattern: /@capacitor\//, rule: 'presentation no puede importar @capacitor/*' }
    ]
  },
  application: {
    forbidden: [
      { pattern: /@presentation|\/presentation\//, rule: 'application no puede importar presentation' },
      { pattern: /@capacitor\//, rule: 'application no puede importar @capacitor/*' }
    ]
  },
  'application/logic': {
    forbidden: [
      { pattern: /@data|\/data\//, rule: 'application/logic no puede importar data' },
      { pattern: /@presentation|\/presentation\//, rule: 'application/logic no puede importar presentation' },
      { pattern: /@platform|\/platform\//, rule: 'application/logic no puede importar platform' },
      { pattern: /@supabase\//, rule: 'application/logic no puede importar @supabase/*' },
      { pattern: /@capacitor\//, rule: 'application/logic no puede importar @capacitor/*' },
      { pattern: /react/, rule: 'application/logic debe ser pura, sin React' }
    ]
  },
  platform: {
    forbidden: [
      { pattern: /@presentation|\/presentation\//, rule: 'platform no puede importar presentation' },
      { pattern: /@application|\/application\//, rule: 'platform no puede importar application' },
      { pattern: /@data|\/data\//, rule: 'platform no puede importar data' },
      { pattern: /@supabase\//, rule: 'platform no puede importar @supabase/*' }
    ]
  },
  data: {
    forbidden: [
      { pattern: /@presentation|\/presentation\//, rule: 'data no puede importar presentation' },
      { pattern: /@application|\/application\//, rule: 'data no puede importar application' },
      { pattern: /@platform|\/platform\//, rule: 'data no puede importar platform' },
      { pattern: /@capacitor\//, rule: 'data no puede importar @capacitor/*' }
    ]
  },
  shared: {
    forbidden: [
      { pattern: /@presentation|\/presentation\//, rule: 'shared no puede importar presentation' },
      { pattern: /@application|\/application\//, rule: 'shared no puede importar application' },
      { pattern: /@platform|\/platform\//, rule: 'shared no puede importar platform' },
      { pattern: /@data|\/data\//, rule: 'shared no puede importar data' },
      { pattern: /@supabase\//, rule: 'shared no puede importar @supabase/*' },
      { pattern: /@capacitor\//, rule: 'shared no puede importar @capacitor/*' }
    ]
  }
};

const COMPOSITION_ROOTS = ['App.tsx', 'main.tsx'];

function getAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

let violations = [];

const files = getAllFiles(SRC_DIR);

for (const filePath of files) {
  const relativePath = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
  
  // Raíz de composición
  if (COMPOSITION_ROOTS.some(root => relativePath === root)) {
    continue;
  }

  // Identificar capa
  let layer = null;
  if (relativePath.startsWith('application/logic/')) {
    layer = 'application/logic';
  } else if (relativePath.startsWith('presentation/')) {
    layer = 'presentation';
  } else if (relativePath.startsWith('application/')) {
    layer = 'application';
  } else if (relativePath.startsWith('platform/')) {
    layer = 'platform';
  } else if (relativePath.startsWith('data/')) {
    layer = 'data';
  } else if (relativePath.startsWith('shared/')) {
    layer = 'shared';
  }

  if (!layer) continue;

  const ruleConfig = RULES[layer];
  if (!ruleConfig) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Buscar sentencias import ... from '...'
    const importMatch = line.match(/import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/);
    if (importMatch) {
      const importPath = importMatch[1];
      for (const check of ruleConfig.forbidden) {
        if (check.pattern.test(importPath)) {
          violations.push({
            file: relativePath,
            line: index + 1,
            importPath,
            rule: check.rule
          });
        }
      }
    }
  });
}

console.log('--- Verificación de Capas de Arquitectura ---');
if (violations.length === 0) {
  console.log('✅ ¡Excelente! Cero violaciones de capas encontradas.');
  process.exit(0);
} else {
  console.error(`❌ Se encontraron ${violations.length} violaciones de arquitectura:`);
  for (const v of violations) {
    console.error(`  [${v.file}:${v.line}] -> "${v.importPath}": ${v.rule}`);
  }
  process.exit(1);
}
