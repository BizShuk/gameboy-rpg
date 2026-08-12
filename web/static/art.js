// art.js — canonical Pokemon RGB-style visual asset registry
"use strict";

window.RGBArt = (() => {
  let manifest = null;
  let assetRoot = "";
  const images = new Map();
  const frames = new Map();
  const silhouettes = new WeakMap();

  function allAssets(data) {
    return ["tiles", "actors", "monsters", "weapons", "items", "effects"]
      .flatMap((group) => Object.values(data[group] || {}));
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        images.set(file, image);
        resolve();
      };
      image.onerror = () => reject(new Error(`Unable to load RGB asset: ${file}`));
      image.src = assetRoot + file;
    });
  }

  async function load(manifestPath) {
    const response = await fetch(manifestPath, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Unable to load RGB manifest (${response.status})`);
    manifest = await response.json();
    assetRoot = manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1);
    const files = [...new Set(allAssets(manifest).map((entry) => entry.file))];
    await Promise.all(files.map(loadImage));
    return manifest;
  }

  function spec(group, id) {
    if (!manifest) throw new Error("RGB asset manifest is not ready");
    const entry = manifest[group] && manifest[group][id];
    if (!entry) throw new Error(`Missing RGB ${group} asset: ${id}`);
    return entry;
  }

  function frame(group, id, index = 0) {
    const entry = spec(group, id);
    const normalized = ((index % entry.frames) + entry.frames) % entry.frames;
    const key = `${group}:${id}:${normalized}`;
    if (frames.has(key)) return frames.get(key);

    const source = images.get(entry.file);
    if (!source) throw new Error(`RGB image is not loaded: ${entry.file}`);
    const canvas = document.createElement("canvas");
    canvas.width = entry.frameWidth;
    canvas.height = entry.frameHeight;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    const column = normalized % entry.columns;
    const row = Math.floor(normalized / entry.columns);
    context.drawImage(
      source,
      column * entry.frameWidth,
      row * entry.frameHeight,
      entry.frameWidth,
      entry.frameHeight,
      0,
      0,
      entry.frameWidth,
      entry.frameHeight,
    );
    frames.set(key, canvas);
    return canvas;
  }

  function drawTile(context, symbol, tileX, tileY, tileSize) {
    const entry = spec("tiles", symbol);
    const source = images.get(entry.file);
    context.drawImage(source, tileX * tileSize, tileY * tileSize, tileSize, tileSize);
  }

  function url(group, id) {
    return assetRoot + spec(group, id).file;
  }

  function tileEffect(symbol) {
    if (!manifest) throw new Error("RGB asset manifest is not ready");
    return manifest.tileEffects && manifest.tileEffects[symbol];
  }

  function silhouette(sprite) {
    let result = silhouettes.get(sprite);
    if (result) return result;
    result = document.createElement("canvas");
    result.width = sprite.width;
    result.height = sprite.height;
    const context = result.getContext("2d");
    context.drawImage(sprite, 0, 0);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = "#9BBC0F";
    context.fillRect(0, 0, result.width, result.height);
    silhouettes.set(sprite, result);
    return result;
  }

  return { load, spec, frame, drawTile, tileEffect, url, silhouette };
})();
