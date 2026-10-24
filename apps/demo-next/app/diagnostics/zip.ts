/** ZIP STORE: existing PNG/JPEG/PDF bytes are not transcoded. No external service. */
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 1024 ** 2) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 ** 2).arrayBuffer());
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function diagnosticZip(files: readonly { path: string; blob: Blob }[]): Promise<Blob> {
  if (files.length > 65535) throw new Error('Zu viele Diagnosedateien.');
  const parts: BlobPart[] = [],
    central: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  const paths = new Set<string>();
  for (const { path, blob } of files) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(path) ||
      path.startsWith('/') ||
      path.split('/').some((part) => !part || part === '..' || part === '.') ||
      paths.has(path)
    )
      throw new Error('Ungültiger Diagnosepfad.');
    paths.add(path);
    const name = new TextEncoder().encode(path);
    if (blob.size > 0xffffffff || offset + blob.size > 0xffffffff || name.length > 65535)
      throw new Error('Diagnosearchiv zu groß.');
    const crc = await crc32(blob);
    const local = new Uint8Array(30 + name.length),
      l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, blob.size, true);
    l.setUint32(22, blob.size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const header = new Uint8Array(46 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x02014b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 20, true);
    h.setUint16(8, 0x800, true);
    h.setUint16(14, 33, true);
    h.setUint32(16, crc, true);
    h.setUint32(20, blob.size, true);
    h.setUint32(24, blob.size, true);
    h.setUint16(28, name.length, true);
    h.setUint32(42, offset, true);
    header.set(name, 46);
    parts.push(local, blob);
    central.push(header);
    offset += local.length + blob.size;
    centralSize += header.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
