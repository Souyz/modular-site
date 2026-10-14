import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const sourceSheet = "output/stable-character-packs/mario_sheet.original.png";
const root = "output/stable-character-packs-ultrahd";
const srcCell = 48;
const scale = 10;
const cell = srcCell * scale;
const cols = 10;
const rows = 10;
const width = cols * cell;
const height = rows * cell;

const characters = [
  {
    id: "liushuo",
    skin: [245, 190, 152],
    hair: [15, 14, 13],
    hairHigh: [62, 57, 52],
    glasses: "round",
    faceShape: "slim",
    shirt: [246, 244, 235],
    shirtShade: [205, 216, 226],
    pants: [36, 72, 132],
    pantsDark: [18, 38, 86],
    mouth: [132, 62, 52],
    ruler: true
  },
  {
    id: "guoliang",
    skin: [226, 171, 136],
    hair: [18, 18, 18],
    hairHigh: [58, 54, 48],
    glasses: "rect",
    faceShape: "round",
    suit: [32, 50, 86],
    suitDark: [12, 22, 44],
    shirt: [230, 238, 250],
    shirtShade: [177, 194, 222],
    pants: [22, 36, 70],
    pantsDark: [9, 18, 38],
    mouth: [82, 48, 44],
    bigBelly: true
  }
];

mkdirSync(root, { recursive: true });

const original = await sharp(sourceSheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (original.info.width !== cols * srcCell || original.info.height !== rows * srcCell) {
  throw new Error(`Unexpected source sheet size: ${original.info.width}x${original.info.height}`);
}

const scaled = await sharp(original.data, { raw: original.info })
  .resize(width, height, { kernel: "nearest" })
  .raw()
  .toBuffer({ resolveWithObject: true });
const hdInfo = { width, height, channels: original.info.channels };

for (const character of characters) {
  const outDir = join(root, character.id);
  mkdirSync(outDir, { recursive: true });
  const out = Buffer.from(scaled.data);
  recolorSheet(out, hdInfo, character);
  await sharp(out, { raw: hdInfo }).png().toFile(join(outDir, "mario_sheet.png"));
  await renderPreview(out, hdInfo, join(outDir, "preview.png"));
}

function recolorSheet(buffer, info, character) {
  for (let frame = 0; frame < cols * rows; frame += 1) {
    const frameInfo = analyzeFrame(buffer, info, frame);
    if (!frameInfo.bounds) continue;

    forEachFramePixel(info, frame, (x, y, absolute) => {
      const alpha = buffer[absolute + 3];
      if (alpha < 12) return;
      const color = [buffer[absolute], buffer[absolute + 1], buffer[absolute + 2]];
      const mapped = mapOriginalColor(color, x, y, frameInfo, character);
      buffer[absolute] = mapped[0];
      buffer[absolute + 1] = mapped[1];
      buffer[absolute + 2] = mapped[2];
    });

    carveCapIntoHair(buffer, info, frame, frameInfo, character);
    drawHairTexture(buffer, info, frame, frameInfo, character);
    drawFace(buffer, info, frame, frameInfo, character);
    drawOutfit(buffer, info, frame, frameInfo, character);
    if (character.bigBelly) drawBigBelly(buffer, info, frame, frameInfo, character);
    if (isSprayFrame(frame)) drawWeakBackSpray(buffer, info, frame, frameInfo);
    if (character.ruler) drawRuler(buffer, info, frame, frameInfo);
  }
}

function mapOriginalColor(color, x, y, frameInfo, c) {
  const kind = classifyOriginalColor(color);
  const b = frameInfo.bounds;
  const localY = y - b.minY;
  const h = Math.max(1, b.maxY - b.minY + 1);
  const br = brightness(color);
  if (kind === "outline") return c.id === "guoliang" ? [12, 13, 17] : [42, 28, 22];
  if (kind === "skin") return shade(c.skin, br, 0.2);
  if (kind === "white") return shade(c.shirt ?? [248, 246, 238], br, 0.12);
  if (kind === "yellow") return shade([185, 132, 78], br, 0.08);
  if (kind === "red") {
    if (localY < h * 0.36) return shade(c.hair, br, 0.18);
    if (c.id === "guoliang") return shade(localY < h * 0.78 ? c.suit : c.suitDark, br, 0.16);
    return shade(localY < h * 0.72 ? c.shirt : c.pantsDark, br, 0.12);
  }
  if (kind === "blue") {
    if (c.id === "guoliang") return shade(localY < h * 0.72 ? c.suit : c.pantsDark, br, 0.16);
    return shade(localY < h * 0.55 ? c.shirtShade : c.pants, br, 0.14);
  }
  return color;
}

function drawFace(buffer, info, frame, frameInfo, c) {
  const face = frameInfo.skinBounds;
  if (!face || face.maxX - face.minX < 14 || face.maxY - face.minY < 14) return;
  const cx = Math.round((face.minX + face.maxX) / 2);
  const eyeY = clamp(Math.round(face.minY + (face.maxY - face.minY) * 0.44), face.minY + 4, face.maxY - 5);
  const leftX = Math.round(face.minX + (face.maxX - face.minX) * 0.35);
  const rightX = Math.round(face.minX + (face.maxX - face.minX) * 0.65);
  softenFace(buffer, info, frame, face, frameInfo, c);
  if (c.faceShape === "round") widenFace(buffer, info, frame, face, frameInfo, c);
  else taperFace(buffer, info, frame, face, frameInfo, c);

  const dark = c.id === "guoliang" ? [12, 16, 20, 255] : [85, 91, 93, 255];
  if (c.glasses === "rect") {
    drawRect(buffer, info, frame, leftX - 6, eyeY - 4, 11, 8, dark, frameInfo);
    drawRect(buffer, info, frame, rightX - 5, eyeY - 4, 11, 8, dark, frameInfo);
  } else {
    drawCircle(buffer, info, frame, leftX, eyeY, 7, dark, frameInfo);
    drawCircle(buffer, info, frame, rightX, eyeY, 7, dark, frameInfo);
  }
  drawLine(buffer, info, frame, leftX + 5, eyeY, rightX - 5, eyeY, dark, frameInfo);
  fillEllipse(buffer, info, frame, leftX, eyeY + 1, 2, 2, [25, 22, 18, 255], frameInfo);
  fillEllipse(buffer, info, frame, rightX, eyeY + 1, 2, 2, [25, 22, 18, 255], frameInfo);
  setInside(buffer, info, frame, leftX - 1, eyeY, [235, 240, 242, 210], frameInfo);
  setInside(buffer, info, frame, rightX - 1, eyeY, [235, 240, 242, 210], frameInfo);
  drawLine(buffer, info, frame, leftX - 5, eyeY - 7, leftX + 3, eyeY - 8, [55, 42, 34, 255], frameInfo);
  drawLine(buffer, info, frame, rightX - 3, eyeY - 8, rightX + 5, eyeY - 7, [55, 42, 34, 255], frameInfo);
  drawLine(buffer, info, frame, cx, eyeY + 3, cx + (c.id === "guoliang" ? 3 : 2), eyeY + 9, [178, 108, 86, 255], frameInfo);
  const mouthY = Math.min(face.maxY - 2, eyeY + 11);
  drawLine(buffer, info, frame, leftX + (c.id === "guoliang" ? -2 : 0), mouthY, rightX + (c.id === "guoliang" ? 2 : 1), mouthY, [...c.mouth, 255], frameInfo);
}

function carveCapIntoHair(buffer, info, frame, frameInfo, c) {
  const face = frameInfo.skinBounds;
  if (!face) return;
  const b = frameInfo.bounds;
  const hair = [...c.hair, 255];
  const skin = [...c.skin, 255];
  const cx = Math.round((face.minX + face.maxX) / 2);
  const unit = scale;
  const top = Math.max(b.minY, face.minY - (c.id === "guoliang" ? 5.2 * unit : 5.8 * unit));
  const bottom = face.minY + 2.2 * unit;
  const baseHalf = Math.round((face.maxX - face.minX) * (c.id === "guoliang" ? 0.42 : 0.38));

  // Delete the whole old cap/brim silhouette first. Recolouring it is why it
  // kept reading as a hat.
  for (let y = Math.max(b.minY, Math.floor(top - 1.4 * unit)); y <= Math.min(b.maxY, Math.ceil(face.minY + 4.2 * unit)); y += 1) {
    for (let x = b.minX; x <= b.maxX; x += 1) {
      clearPixelInFrame(buffer, info, frame, x, y);
    }
  }

  // Rebuild head hair as a compact organic hair mass, using setPixel so it can
  // draw over the transparent pixels we just cleared.
  for (let y = Math.round(top); y <= Math.round(bottom); y += 1) {
    const t = (y - top) / Math.max(1, bottom - top);
    const half = Math.round(baseHalf * (0.55 + 0.5 * Math.sin(clamp(t, 0, 1) * Math.PI * 0.78)));
    for (let x = cx - half; x <= cx + half; x += 1) {
      const d = ((x - cx) * (x - cx)) / Math.max(1, half * half) + ((y - (top + (bottom - top) * 0.58)) ** 2) / Math.max(1, ((bottom - top) * 0.62) ** 2);
      if (d <= 1.15) setPixelInFrame(buffer, info, frame, x, y, hair);
    }
  }

  // Forehead/skin notches make the lower edge read as hair, not a brim.
  fillEllipseFree(
    buffer,
    info,
    frame,
    cx,
    face.minY + Math.round(1.5 * unit),
    Math.round((face.maxX - face.minX) * (c.id === "guoliang" ? 0.31 : 0.34)),
    Math.round(2.7 * unit),
    skin
  );
  for (const [nx, ny, w, h] of [
    [face.minX + Math.round(1.6 * unit), face.minY + Math.round(0.4 * unit), Math.round(2.4 * unit), Math.round(1.8 * unit)],
    [cx - Math.round(1.0 * unit), face.minY + Math.round(0.8 * unit), Math.round(1.6 * unit), Math.round(2.2 * unit)],
    [face.maxX - Math.round(3.8 * unit), face.minY + Math.round(0.4 * unit), Math.round(2.4 * unit), Math.round(1.8 * unit)]
  ]) {
    fillEllipseFree(buffer, info, frame, nx, ny, w, h, skin);
  }
  if (c.id === "liushuo") {
    drawLineFreeThick(buffer, info, frame, cx - Math.round(6 * unit), face.minY - Math.round(0.8 * unit), cx - Math.round(2 * unit), face.minY - Math.round(4.4 * unit), [...c.hairHigh, 255], Math.max(1, Math.round(0.35 * unit)));
    drawLineFreeThick(buffer, info, frame, cx - Math.round(1.5 * unit), face.minY - Math.round(0.3 * unit), cx + Math.round(3.2 * unit), face.minY - Math.round(4.8 * unit), [...c.hairHigh, 255], Math.max(1, Math.round(0.32 * unit)));
    drawLineFreeThick(buffer, info, frame, cx + Math.round(3.4 * unit), face.minY, cx + Math.round(6.2 * unit), face.minY - Math.round(3.4 * unit), hair, Math.max(1, Math.round(0.34 * unit)));
    drawLineFreeThick(buffer, info, frame, cx - Math.round(3.8 * unit), face.minY + Math.round(0.5 * unit), cx - Math.round(4.8 * unit), face.minY - Math.round(2.1 * unit), hair, Math.max(1, Math.round(0.25 * unit)));
  } else {
    drawLineFreeThick(buffer, info, frame, cx - Math.round(6.4 * unit), face.minY - Math.round(1.1 * unit), cx + Math.round(5.2 * unit), face.minY - Math.round(3.8 * unit), [...c.hairHigh, 255], Math.max(1, Math.round(0.38 * unit)));
    drawLineFreeThick(buffer, info, frame, cx - Math.round(5 * unit), face.minY + Math.round(0.3 * unit), cx + Math.round(7 * unit), face.minY - Math.round(2.2 * unit), hair, Math.max(1, Math.round(0.34 * unit)));
    drawLineFreeThick(buffer, info, frame, cx - Math.round(1.2 * unit), face.minY + Math.round(0.5 * unit), cx - Math.round(2.6 * unit), face.minY - Math.round(2.2 * unit), hair, Math.max(1, Math.round(0.28 * unit)));
  }
}

function drawHairTexture(buffer, info, frame, frameInfo, c) {
  const face = frameInfo.skinBounds;
  if (!face) return;
  const hair = [...c.hair, 255];
  const high = [...c.hairHigh, 255];
  if (c.id === "liushuo") {
    drawLine(buffer, info, frame, face.minX + 2, face.minY - 5, face.maxX - 7, face.minY - 9, high, frameInfo);
    drawLine(buffer, info, frame, face.maxX - 4, face.minY - 6, face.maxX - 12, face.minY + 7, hair, frameInfo);
    drawLine(buffer, info, frame, face.maxX - 8, face.minY - 5, face.maxX - 15, face.minY + 7, hair, frameInfo);
  } else {
    drawLine(buffer, info, frame, face.minX + 2, face.minY - 4, face.maxX - 3, face.minY - 7, high, frameInfo);
    drawLine(buffer, info, frame, face.minX + 4, face.minY, face.maxX - 8, face.minY - 4, hair, frameInfo);
  }
}

function drawOutfit(buffer, info, frame, frameInfo, c) {
  const b = frameInfo.bounds;
  if (!b || !frameInfo.skinBounds || b.maxY - b.minY < 34) return;
  const cx = Math.round((b.minX + b.maxX) / 2);
  const top = Math.round(b.minY + (b.maxY - b.minY) * 0.46);
  const bottom = Math.round(b.minY + (b.maxY - b.minY) * 0.74);
  const loose = { bounds: { minX: 0, minY: b.minY, maxX: cell - 1, maxY: b.maxY } };
  if (c.id === "liushuo") {
    drawLine(buffer, info, frame, cx - 8, top, cx - 1, top + 8, [205, 214, 224, 255], loose);
    drawLine(buffer, info, frame, cx + 8, top, cx + 1, top + 8, [205, 214, 224, 255], loose);
    drawLine(buffer, info, frame, cx, top + 5, cx, bottom, [184, 196, 210, 255], loose);
    drawLine(buffer, info, frame, b.minX + 5, bottom, b.maxX - 5, bottom, [18, 38, 86, 255], loose);
  } else {
    drawLine(buffer, info, frame, cx - 12, top, cx - 2, bottom, [223, 232, 248, 255], loose);
    drawLine(buffer, info, frame, cx + 12, top, cx + 2, bottom, [223, 232, 248, 255], loose);
    drawLine(buffer, info, frame, cx, top + 4, cx, bottom + 4, [11, 18, 33, 255], loose);
    drawLine(buffer, info, frame, b.minX + 4, top, b.minX + 4, Math.min(b.maxY - 8, bottom + 8), [6, 12, 26, 255], loose);
  }
}

function drawBigBelly(buffer, info, frame, frameInfo, c) {
  const b = frameInfo.bounds;
  if (!frameInfo.skinBounds || b.maxX - b.minX > 38 * scale || b.maxY - b.minY > 41 * scale) return;
  const cx = Math.round((b.minX + b.maxX) / 2) + 2;
  const cy = Math.round(b.minY + (b.maxY - b.minY) * 0.64);
  const rx = Math.max(9 * scale, Math.round((b.maxX - b.minX) * 0.46));
  const ry = Math.max(6 * scale, Math.round((b.maxY - b.minY) * 0.24));
  const loose = { bounds: { minX: 0, minY: b.minY, maxX: cell - 1, maxY: b.maxY } };
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const d = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (d <= 1) setPixelInFrame(buffer, info, frame, x, y, [...c.suit, 255]);
      if (d > 0.88 && d <= 1.08) setPixelInFrame(buffer, info, frame, x, y, [9, 17, 34, 255]);
    }
  }
  drawLine(buffer, info, frame, b.minX + 4, cy - ry, b.minX + 4, cy + ry, [5, 11, 24, 255], loose);
}

function drawRuler(buffer, info, frame, frameInfo) {
  const b = frameInfo.bounds;
  const pound = frame >= 60 && frame <= 71;
  const x1 = pound ? b.minX + 4 : b.maxX - 10;
  const y1 = pound ? b.minY + 6 : Math.round(b.minY + (b.maxY - b.minY) * 0.4);
  const x2 = pound ? b.maxX - 4 : b.maxX - 2;
  const y2 = pound ? b.maxY - 8 : Math.round(b.minY + (b.maxY - b.minY) * 0.8);
  drawLine(buffer, info, frame, x1, y1, x2, y2, [232, 184, 96, 255], frameInfo);
  drawLine(buffer, info, frame, x1 + 1, y1, x2 + 1, y2, [104, 68, 30, 255], frameInfo);
  drawLine(buffer, info, frame, x1 - 1, y1, x2 - 1, y2, [104, 68, 30, 255], frameInfo);
}

function isSprayFrame(frame) {
  return (frame >= 30 && frame <= 40) || (frame >= 49 && frame <= 51);
}

function drawWeakBackSpray(buffer, info, frame, frameInfo) {
  const b = frameInfo.bounds;
  if (!b || b.maxY - b.minY < 32) return;
  const startX = Math.round((b.minX + b.maxX) / 2);
  const startY = Math.round(b.minY + (b.maxY - b.minY) * 0.58);
  const dir = frame % 2 === 0 ? 1 : -1;
  for (let i = 0; i <= 22; i += 1) {
    const t = i / 22;
    const x = Math.round(startX + dir * (8 + 28 * t));
    const y = Math.round(startY - 10 * Math.sin(t * Math.PI) + 6 * t);
    setPixelInFrame(buffer, info, frame, x, y, [136, 218, 255, 150]);
    if (i % 4 === 0) setPixelInFrame(buffer, info, frame, x + dir, y, [218, 246, 255, 120]);
  }
}

function softenFace(buffer, info, frame, face, frameInfo, c) {
  const cx = Math.round((face.minX + face.maxX) / 2);
  const cy = Math.round(face.minY + (face.maxY - face.minY) * 0.58);
  const rx = Math.max(8, Math.round((face.maxX - face.minX) * (c.id === "guoliang" ? 0.36 : 0.28)));
  const ry = Math.max(6, Math.round((face.maxY - face.minY) * 0.22));
  fillEllipse(buffer, info, frame, cx, cy, rx, ry, [...c.skin, 255], frameInfo, 0.48);
}

function widenFace(buffer, info, frame, face, frameInfo, c) {
  const color = [...c.skin, 255];
  for (let y = face.minY + 4; y <= face.maxY - 2; y += 1) {
    const pad = Math.round(3 + 3 * (1 - Math.abs(y - (face.minY + face.maxY) / 2) / Math.max(1, face.maxY - face.minY)));
    for (let x = face.minX - pad; x <= face.minX; x += 1) setInside(buffer, info, frame, x, y, color, frameInfo);
    for (let x = face.maxX; x <= face.maxX + pad; x += 1) setInside(buffer, info, frame, x, y, color, frameInfo);
  }
}

function taperFace(buffer, info, frame, face, frameInfo, c) {
  for (let y = face.minY + 5; y <= face.maxY - 3; y += 1) {
    blendInside(buffer, info, frame, face.minX, y, [...c.hair, 255], 0.25, frameInfo);
    blendInside(buffer, info, frame, face.maxX, y, [...c.hair, 255], 0.2, frameInfo);
  }
}

function analyzeFrame(buffer, info, frame) {
  const bounds = emptyBounds();
  const skinBounds = emptyBounds();
  forEachFramePixel(info, frame, (x, y, absolute) => {
    if (buffer[absolute + 3] < 12) return;
    add(bounds, x, y);
    if (classifyOriginalColor([buffer[absolute], buffer[absolute + 1], buffer[absolute + 2]]) === "skin") add(skinBounds, x, y);
  });
  return { bounds: valid(bounds) ? bounds : null, skinBounds: valid(skinBounds) ? skinBounds : null };
}

function forEachFramePixel(info, frame, callback) {
  const fx = (frame % cols) * cell;
  const fy = Math.floor(frame / cols) * cell;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      callback(x, y, ((fy + y) * info.width + fx + x) * info.channels);
    }
  }
}

function drawRect(buffer, info, frame, x, y, w, h, color, frameInfo) {
  drawLine(buffer, info, frame, x, y, x + w, y, color, frameInfo);
  drawLine(buffer, info, frame, x, y + h, x + w, y + h, color, frameInfo);
  drawLine(buffer, info, frame, x, y, x, y + h, color, frameInfo);
  drawLine(buffer, info, frame, x + w, y, x + w, y + h, color, frameInfo);
}

function drawCircle(buffer, info, frame, cx, cy, r, color, frameInfo) {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    setInside(buffer, info, frame, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), color, frameInfo);
  }
}

function fillEllipse(buffer, info, frame, cx, cy, rx, ry, color, frameInfo, blend = 0) {
  for (let yy = -ry; yy <= ry; yy += 1) {
    for (let xx = -rx; xx <= rx; xx += 1) {
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) {
        if (blend) blendInside(buffer, info, frame, cx + xx, cy + yy, color, blend, frameInfo);
        else setInside(buffer, info, frame, cx + xx, cy + yy, color, frameInfo);
      }
    }
  }
}

function drawLine(buffer, info, frame, x1, y1, x2, y2, color, frameInfo) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    setInside(buffer, info, frame, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), color, frameInfo);
  }
}

function drawLineFree(buffer, info, frame, x1, y1, x2, y2, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    setPixelInFrame(buffer, info, frame, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), color);
  }
}

function drawLineFreeThick(buffer, info, frame, x1, y1, x2, y2, color, radius) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    fillEllipseFree(
      buffer,
      info,
      frame,
      Math.round(x1 + (x2 - x1) * t),
      Math.round(y1 + (y2 - y1) * t),
      radius,
      radius,
      color
    );
  }
}

function fillEllipseFree(buffer, info, frame, cx, cy, rx, ry, color) {
  for (let yy = -ry; yy <= ry; yy += 1) {
    for (let xx = -rx; xx <= rx; xx += 1) {
      if ((xx * xx) / Math.max(1, rx * rx) + (yy * yy) / Math.max(1, ry * ry) <= 1) {
        setPixelInFrame(buffer, info, frame, cx + xx, cy + yy, color);
      }
    }
  }
}

function setInside(buffer, info, frame, x, y, color, frameInfo, minAlpha = 12) {
  const b = frameInfo.bounds;
  if (!b || x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return;
  const fx = (frame % cols) * cell;
  const fy = Math.floor(frame / cols) * cell;
  const absolute = ((fy + y) * info.width + fx + x) * info.channels;
  if (buffer[absolute + 3] < minAlpha) return;
  buffer[absolute] = color[0];
  buffer[absolute + 1] = color[1];
  buffer[absolute + 2] = color[2];
  buffer[absolute + 3] = color[3] ?? 255;
}

function setPixelInFrame(buffer, info, frame, x, y, color) {
  if (x < 0 || x >= cell || y < 0 || y >= cell) return;
  const fx = (frame % cols) * cell;
  const fy = Math.floor(frame / cols) * cell;
  const absolute = ((fy + y) * info.width + fx + x) * info.channels;
  buffer[absolute] = color[0];
  buffer[absolute + 1] = color[1];
  buffer[absolute + 2] = color[2];
  buffer[absolute + 3] = color[3] ?? 255;
}

function clearPixelInFrame(buffer, info, frame, x, y) {
  if (x < 0 || x >= cell || y < 0 || y >= cell) return;
  const fx = (frame % cols) * cell;
  const fy = Math.floor(frame / cols) * cell;
  const absolute = ((fy + y) * info.width + fx + x) * info.channels;
  buffer[absolute] = 0;
  buffer[absolute + 1] = 0;
  buffer[absolute + 2] = 0;
  buffer[absolute + 3] = 0;
}

function blendInside(buffer, info, frame, x, y, color, amount, frameInfo) {
  const b = frameInfo.bounds;
  if (!b || x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return;
  const fx = (frame % cols) * cell;
  const fy = Math.floor(frame / cols) * cell;
  const absolute = ((fy + y) * info.width + fx + x) * info.channels;
  if (buffer[absolute + 3] < 12) return;
  buffer[absolute] = Math.round(buffer[absolute] * (1 - amount) + color[0] * amount);
  buffer[absolute + 1] = Math.round(buffer[absolute + 1] * (1 - amount) + color[1] * amount);
  buffer[absolute + 2] = Math.round(buffer[absolute + 2] * (1 - amount) + color[2] * amount);
}

async function renderPreview(data, info, output) {
  const checker = Buffer.alloc(info.width * info.height * info.channels);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const tile = (Math.floor(x / cell) + Math.floor(y / cell)) % 2;
      const value = tile ? 214 : 239;
      const i = (y * info.width + x) * info.channels;
      checker[i] = value; checker[i + 1] = value; checker[i + 2] = value; checker[i + 3] = 255;
    }
  }
  for (let i = 0; i < checker.length; i += info.channels) {
    const alpha = data[i + 3] / 255;
    if (alpha <= 0) continue;
    checker[i] = Math.round(data[i] * alpha + checker[i] * (1 - alpha));
    checker[i + 1] = Math.round(data[i + 1] * alpha + checker[i + 1] * (1 - alpha));
    checker[i + 2] = Math.round(data[i + 2] * alpha + checker[i + 2] * (1 - alpha));
  }
  await sharp(checker, { raw: info }).resize(480, 480, { kernel: "nearest" }).png().toFile(output);
}

function classifyOriginalColor([r, g, b]) {
  const palette = [
    ["outline", [60, 19, 0]],
    ["red", [233, 82, 60]],
    ["red", [188, 48, 62]],
    ["red", [153, 14, 56]],
    ["red", [191, 58, 34]],
    ["blue", [61, 53, 157]],
    ["blue", [92, 124, 204]],
    ["skin", [242, 131, 58]],
    ["skin", [255, 203, 143]],
    ["white", [250, 231, 233]],
    ["white", [255, 255, 255]],
    ["yellow", [252, 186, 85]],
    ["outline", [70, 60, 57]]
  ];
  let best = palette[0];
  let bestDistance = Infinity;
  for (const candidate of palette) {
    const d = distance([r, g, b], candidate[1]);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best[0];
}

function emptyBounds() { return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; }
function add(bounds, x, y) { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y); }
function valid(bounds) { return Number.isFinite(bounds.minX) && bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY; }
function distance(a, b) { return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; }
function brightness([r, g, b]) { return (r + g + b) / (255 * 3); }
function shade(base, sourceBrightness, strength) {
  const factor = 1 + (sourceBrightness - 0.5) * strength;
  return base.map((channel) => clamp(Math.round(channel * factor), 0, 255));
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
