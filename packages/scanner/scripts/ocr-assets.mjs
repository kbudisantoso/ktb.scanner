import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from './notices.mjs';

const version = '7.0.0';
const modelCommit = '65727574dfcd264acbb0c3e07860e4e9e9b22185';
const coreFiles = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/** Copy reviewed runtime inputs; builds never download OCR models or code. */
export async function copyOcrAssets() {
  const target = 'dist/assets/ocr';
  await mkdir(join(target, 'core'), { recursive: true });
  await mkdir(join(target, 'models'), { recursive: true });
  for (const name of ['tesseract.js', 'tesseract.js-core']) {
    const root = await packageRoot(name, process.cwd());
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (manifest.version !== version)
      throw new Error(`Review OCR adapter for ${name}@${manifest.version}`);
    if (name === 'tesseract.js') {
      for (const file of ['worker.min.js', 'worker.min.js.LICENSE.txt'])
        await copyFile(join(root, 'dist', file), join(target, file));
    } else {
      for (const file of coreFiles) await copyFile(join(root, file), join(target, 'core', file));
    }
  }
  const manifest = JSON.parse(await readFile('assets/ocr/models.json', 'utf8'));
  if (
    manifest.commit !== modelCommit ||
    manifest.license !== 'Apache-2.0' ||
    manifest.models.length !== 2 ||
    manifest.models
      .map((model) => model.language)
      .sort()
      .join(',') !== 'deu,eng'
  )
    throw new Error('Review OCR model provenance before changing the bundled models');
  for (const model of manifest.models) {
    if (model.file !== `models/${model.language}.traineddata`)
      throw new Error('Unexpected OCR model path');
    const bytes = await readFile(join('assets/ocr', model.file));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== model.bytes || sha256 !== model.sha256)
      throw new Error(`OCR model checksum mismatch: ${model.language}`);
    await copyFile(join('assets/ocr', model.file), join(target, model.file));
  }
  await copyFile('assets/ocr/models.json', join(target, 'models.json'));
}
