import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(appRoot, "public");
const sourcePath = path.join(publicDir, "apple-touch-icon.png");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Source icon is not a PNG file");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`Invalid PNG chunk ${type}`);
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") transparency = Buffer.from(data);
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;

    offset = dataEnd + 4;
  }

  if (!width || !height || !idat.length) throw new Error("PNG is missing IHDR or IDAT data");
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`Unsupported source PNG format: bitDepth=${bitDepth}, interlace=${interlace}`);
  }

  const channelsByType = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
  const channels = channelsByType.get(colorType);
  if (!channels) throw new Error(`Unsupported source PNG color type: ${colorType}`);
  if (colorType === 3 && !palette) throw new Error("Indexed PNG is missing its palette");

  const rowBytes = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const expected = height * (rowBytes + 1);
  if (inflated.length !== expected) throw new Error(`Unexpected PNG data length: got ${inflated.length}, expected ${expected}`);

  const rows = new Array(height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    const sourceRow = inflated.subarray(inputOffset, inputOffset + rowBytes);
    inputOffset += rowBytes;
    const row = Buffer.alloc(rowBytes);
    const previous = y > 0 ? rows[y - 1] : null;

    for (let x = 0; x < rowBytes; x += 1) {
      const raw = sourceRow[x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
      row[x] = (raw + predictor) & 0xff;
    }
    rows[y] = row;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      if (colorType === 6) {
        const i = x * 4;
        rgba[out] = row[i];
        rgba[out + 1] = row[i + 1];
        rgba[out + 2] = row[i + 2];
        rgba[out + 3] = row[i + 3];
      } else if (colorType === 2) {
        const i = x * 3;
        rgba[out] = row[i];
        rgba[out + 1] = row[i + 1];
        rgba[out + 2] = row[i + 2];
        rgba[out + 3] = 255;
      } else if (colorType === 3) {
        const index = row[x];
        const p = index * 3;
        if (p + 2 >= palette.length) throw new Error(`Palette index out of range: ${index}`);
        rgba[out] = palette[p];
        rgba[out + 1] = palette[p + 1];
        rgba[out + 2] = palette[p + 2];
        rgba[out + 3] = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (colorType === 4) {
        const i = x * 2;
        rgba[out] = row[i];
        rgba[out + 1] = row[i];
        rgba[out + 2] = row[i];
        rgba[out + 3] = row[i + 1];
      } else {
        rgba[out] = row[x];
        rgba[out + 1] = row[x];
        rgba[out + 2] = row[x];
        rgba[out + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

function resizeRgba(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const target = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.max(0, Math.min(sourceHeight - 1, ((y + 0.5) * sourceHeight) / targetHeight - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.max(0, Math.min(sourceWidth - 1, ((x + 0.5) * sourceWidth) / targetWidth - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = sx - x0;
      const out = (y * targetWidth + x) * 4;
      const i00 = (y0 * sourceWidth + x0) * 4;
      const i10 = (y0 * sourceWidth + x1) * 4;
      const i01 = (y1 * sourceWidth + x0) * 4;
      const i11 = (y1 * sourceWidth + x1) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = source[i00 + c] * (1 - fx) + source[i10 + c] * fx;
        const bottom = source[i01 + c] * (1 - fx) + source[i11 + c] * fx;
        target[out + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return target;
}

function compositeOver(background, foreground, canvasWidth, foregroundWidth, foregroundHeight, offsetX, offsetY) {
  for (let y = 0; y < foregroundHeight; y += 1) {
    for (let x = 0; x < foregroundWidth; x += 1) {
      const fg = (y * foregroundWidth + x) * 4;
      const bg = ((y + offsetY) * canvasWidth + x + offsetX) * 4;
      const alpha = foreground[fg + 3] / 255;
      background[bg] = Math.round(foreground[fg] * alpha + background[bg] * (1 - alpha));
      background[bg + 1] = Math.round(foreground[fg + 1] * alpha + background[bg + 1] * (1 - alpha));
      background[bg + 2] = Math.round(foreground[fg + 2] * alpha + background[bg + 2] * (1 - alpha));
      background[bg + 3] = 255;
    }
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodeRgbaPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND"),
  ]);
}

function writePng(filename, width, height, rgba) {
  fs.writeFileSync(path.join(publicDir, filename), encodeRgbaPng(width, height, rgba));
}

if (!fs.existsSync(sourcePath)) throw new Error(`Missing source icon: ${sourcePath}`);
const source = decodePng(fs.readFileSync(sourcePath));
if (source.width !== source.height) throw new Error("The source app icon must be square");

writePng("pwa-192x192.png", 192, 192, resizeRgba(source.rgba, source.width, source.height, 192, 192));
writePng("pwa-512x512.png", 512, 512, resizeRgba(source.rgba, source.width, source.height, 512, 512));

const maskSize = 512;
const maskable = Buffer.alloc(maskSize * maskSize * 4);
for (let i = 0; i < maskable.length; i += 4) {
  maskable[i] = 8;
  maskable[i + 1] = 8;
  maskable[i + 2] = 6;
  maskable[i + 3] = 255;
}
const safeSize = 400;
const safeIcon = resizeRgba(source.rgba, source.width, source.height, safeSize, safeSize);
compositeOver(maskable, safeIcon, maskSize, safeSize, safeSize, (maskSize - safeSize) / 2, (maskSize - safeSize) / 2);
writePng("pwa-maskable-512x512.png", 512, 512, maskable);

console.log(`Generated PWA icons from ${path.relative(appRoot, sourcePath)} (${source.width}x${source.height}).`);
