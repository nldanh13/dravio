import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Use the installed compiler so Node 20 works without a TS runtime dependency.
async function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}
const { emberlingMesh } = await load('../../src/rendering/inspection/emberlingMesh.ts');
const { encodeInspectionGlb } = await load('../../src/rendering/inspection/exportGlb.ts');
const glb = encodeInspectionGlb(emberlingMesh());
const destination = resolve(process.argv[2] ?? 'art-exports/emberling-baby-normal.glb');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, glb);
console.log('Prototype GLB: ' + destination + ' (' + glb.byteLength + ' bytes)');
