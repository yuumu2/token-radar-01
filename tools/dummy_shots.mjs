import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const width = 1440;
const height = 1080;
const directory = new URL('../screenshots/', import.meta.url);
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length);
  result.write(type, 4, 'ascii');
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function solidPng(color) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB

  // Each scanline begins with a zero byte for the unfiltered PNG encoding.
  const stride = 1 + width * 3;
  const line = Buffer.alloc(stride);
  line.fill(Buffer.from(color), 1);
  const pixels = Buffer.alloc(stride * height).fill(line);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(directory, { recursive: true });
for (const [name, color] of [
  ['01-board.png', [35, 69, 56]],
  ['02-detail.png', [51, 73, 91]],
  ['03-filtered.png', [104, 77, 54]],
]) {
  writeFileSync(new URL(name, directory), solidPng(color));
}
