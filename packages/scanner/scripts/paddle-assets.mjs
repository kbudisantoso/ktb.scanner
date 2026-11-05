import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from './notices.mjs';

/** Copy pinned, reviewed browser inputs. Builds never download code or models. */
export async function copyPaddleAssets() {
  const source = 'assets/ocr/paddle';
  const target = 'dist/assets/ocr/paddle';
  await mkdir(target, { recursive: true });
  const manifest = JSON.parse(await readFile(join(source, 'models.json'), 'utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.sdk !== '@paddleocr/paddleocr-js@0.4.2' ||
    manifest.runtime !== 'onnxruntime-web@1.31.1' ||
    manifest.opencv !== '@techstark/opencv-js@4.10.0-release.1' ||
    manifest.license !== 'Apache-2.0' ||
    manifest.dictionary.characters !== 502 ||
    manifest.models.map((model) => model.file).join(',') !== 'det.tar,rec.tar'
  )
    throw new Error('Review Paddle model provenance before changing the bundled inputs');
  const ort = await packageRoot('onnxruntime-web', process.cwd());
  for (const [name, version] of [
    ['@paddleocr/paddleocr-js', '0.4.2'],
    ['onnxruntime-web', '1.31.1'],
    ['onnxruntime-common', '1.31.1'],
    ['@techstark/opencv-js', '4.10.0-release.1'],
  ]) {
    const root = await packageRoot(name, name === 'onnxruntime-common' ? ort : process.cwd());
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (metadata.version !== version) throw new Error(`Review Paddle adapter for ${name}`);
  }
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  for (const model of manifest.models) {
    const bytes = await readFile(join(source, model.file));
    if (bytes.length !== model.bytes || digest(bytes) !== model.sha256)
      throw new Error(`Paddle model checksum mismatch: ${model.file}`);
    await copyFile(join(source, model.file), join(target, model.file));
  }
  const font = JSON.parse(await readFile(join(source, 'pdf-font.json'), 'utf8'));
  const bytes = await readFile(join(source, 'pdf.ttf'));
  if (
    font.file !== 'pdf.ttf' ||
    font.license !== 'Apache-2.0' ||
    font.bytes !== 572 ||
    bytes.length !== font.bytes ||
    digest(bytes) !== font.sha256 ||
    font.sha256 !== 'c7845420925a23d88ed830a63957b8af85a66a8daf8d9fc90e843673b2ef1a59'
  )
    throw new Error('Paddle PDF font checksum mismatch');
  for (const file of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    const bytes = await readFile(join(ort, 'dist', file));
    const expected = manifest.runtimeFiles[file];
    if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)
      throw new Error(`Paddle runtime checksum mismatch: ${file}`);
    await copyFile(join(ort, 'dist', file), join(target, file));
  }
  for (const file of [
    'models.json',
    'model-configs.json',
    'pdf.ttf',
    'pdf-font.json',
    'pdf-font.LICENSE',
  ])
    await copyFile(join(source, file), join(target, file));
}
