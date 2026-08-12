#!/usr/bin/env python3
"""Build the canonical four-shade Game Boy art bundle from generated sources."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "rgb" / "source"
PROCESSED = ROOT / "art" / "rgb" / "processed"
RUNTIME = ROOT / "web" / "static" / "assets" / "rgb"
PROCESSOR = ROOT / ".agents" / "skills" / "generate2dsprite" / "scripts" / "generate2dsprite.py"

PALETTE = (
    (15, 56, 15),
    (48, 98, 48),
    (139, 172, 15),
    (155, 188, 15),
)


def recreate(path: Path) -> None:
    path.resolve().relative_to(ROOT.resolve())
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def palette_index(luminance: int) -> int:
    if luminance < 64:
        return 0
    if luminance < 128:
        return 1
    if luminance < 192:
        return 2
    return 3


def palette_image(image: Image.Image, *, transparent: bool) -> Image.Image:
    rgba = image.convert("RGBA")
    output = Image.new("RGBA" if transparent else "RGB", rgba.size)
    source_pixels = rgba.load()
    output_pixels = output.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = source_pixels[x, y]
            if transparent and alpha < 128:
                output_pixels[x, y] = (0, 0, 0, 0)
                continue
            luminance = round(0.299 * red + 0.587 * green + 0.114 * blue)
            color = PALETTE[palette_index(luminance)]
            output_pixels[x, y] = (*color, 255) if transparent else color
    return output


def gif_frame(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    output = Image.new("P", rgba.size, 0)
    colors = [(0, 0, 0), *PALETTE]
    output.putpalette([channel for color in colors for channel in color] + [0] * (768 - len(colors) * 3))
    output.putdata([
        0 if alpha < 128 else PALETTE.index((red, green, blue)) + 1
        for red, green, blue, alpha in rgba.getdata()
    ])
    return output


def prompt_path(source_name: str) -> str:
    prompt_name = f"{source_name}.prompt.txt"
    shutil.copy2(SOURCE / prompt_name, RUNTIME / "prompts" / prompt_name)
    return f"prompts/{prompt_name}"


def asset(file: str, prompt: str, width: int, height: int, frames: int = 1, columns: int = 1, **extra: object) -> dict[str, object]:
    result: dict[str, object] = {
        "file": file,
        "prompt": prompt,
        "frameWidth": width,
        "frameHeight": height,
        "frames": frames,
        "columns": columns,
    }
    result.update(extra)
    return result


def build_tiles() -> dict[str, dict[str, object]]:
    tile_sets = (
        (
            "tiles-overworld",
            (
                (".", "grass"), (",", "flower-grass"), ("g", "tall-grass"), ("P", "path"),
                ("p", "plaza"), ("f", "farm"), ("b", "bridge"), ("_", "forest-floor"),
                ("k", "forest-grass"), ("W", "water"), ("y", "water-lily"), ("T", "tree"),
                ("F", "fence"), ("H", "wall"), ("B", "bush"), ("r", "rock"),
            ),
        ),
        (
            "tiles-town",
            (
                ("R", "roof-striped"), ("U", "roof-crosshatched"), ("V", "roof-chevron"), ("D", "door"),
                ("S", "sign"), ("C", "weapon-counter"), ("A", "item-counter"), ("O", "well"),
                ("L", "lamp"), ("x", "crate"), ("t", "stump"), ("M", "moon-altar"),
                ("<", "stairs-down"), (">", "stairs-up"), ("^", "campfire"), (None, "grass-backup"),
            ),
        ),
        (
            "tiles-depths",
            (
                ("q", "shrine-floor"), ("Z", "shrine-wall"), ("d", "cave-floor"), ("c", "cave-wall"),
                ("l", "lava"), ("o", "torch"), ("m", "meteor-ore"), ("G", "abyss-gate"),
                ("v", "void"), ("n", "star-floor"), (":", "star-bridge"), ("@", "portal"),
                ("*", "star-crystal"), ("E", "core-altar"), (None, "void-crack"), (None, "shrine-threshold"),
            ),
        ),
    )
    tiles: dict[str, dict[str, object]] = {}
    for source_name, definitions in tile_sets:
        source = Image.open(SOURCE / f"{source_name}.raw.png").convert("RGB")
        prompt = prompt_path(source_name)
        for index, (symbol, name) in enumerate(definitions):
            if symbol is None:
                continue
            column, row = index % 4, index // 4
            left = round(column * source.width / 4)
            top = round(row * source.height / 4)
            right = round((column + 1) * source.width / 4)
            bottom = round((row + 1) * source.height / 4)
            inset = max(4, round(min(right - left, bottom - top) * 0.018))
            cell = source.crop((left + inset, top + inset, right - inset, bottom - inset))
            cell = cell.resize((16, 16), Image.Resampling.BOX)
            cell = palette_image(cell, transparent=False)
            output = RUNTIME / "tiles" / f"{name}.png"
            cell.save(output, optimize=True)
            tiles[symbol] = asset(f"tiles/{name}.png", prompt, 16, 16)
    return tiles


def process_sheet(
    name: str,
    *,
    target: str,
    mode: str,
    rows: int,
    columns: int,
    cell_size: int,
    align: str,
    component_mode: str = "largest",
    max_body_scale_cv: Optional[float] = None,
    max_anchor_y_std: Optional[float] = None,
    allow_source_edge_touch: bool = False,
    trim_border: int = 4,
) -> tuple[Path, dict[str, object], str]:
    output = PROCESSED / name
    command = [
        sys.executable,
        "-W", "ignore::DeprecationWarning",
        str(PROCESSOR),
        "process",
        "--input", str(SOURCE / f"{name}.raw.png"),
        "--target", target,
        "--mode", mode,
        "--rows", str(rows),
        "--cols", str(columns),
        "--output-dir", str(output),
        "--cell-size", str(cell_size),
        "--fit-scale", "0.80",
        "--trim-border", str(trim_border),
        "--align", align,
        "--shared-scale",
        "--component-mode", component_mode,
        "--strict-qc",
        "--prompt-file", str(SOURCE / f"{name}.prompt.txt"),
    ]
    if max_body_scale_cv is not None:
        command.extend(("--max-body-scale-cv", str(max_body_scale_cv)))
    if max_anchor_y_std is not None:
        command.extend(("--max-anchor-y-std", str(max_anchor_y_std)))
    if allow_source_edge_touch:
        command.append("--allow-source-edge-touch")
    subprocess.run(command, cwd=ROOT, check=True)
    metadata = json.loads((output / "pipeline-meta.json").read_text())
    prompt = prompt_path(name)
    return output, metadata, prompt


def build_actors() -> dict[str, dict[str, object]]:
    actors: dict[str, dict[str, object]] = {}
    output, _, prompt = process_sheet(
        "player-walk", target="player", mode="walk", rows=4, columns=4,
        cell_size=32, align="feet", max_body_scale_cv=0.08,
        allow_source_edge_touch=True,
    )
    runtime = palette_image(Image.open(output / "sheet-transparent.png"), transparent=True)
    runtime.save(RUNTIME / "actors" / "player.png", optimize=True)
    directions = {"d": [0, 1, 2, 3], "l": [4, 5, 6, 7], "r": [8, 9, 10, 11], "u": [12, 13, 14, 15]}
    direction_strips: dict[str, str] = {}
    direction_gifs: dict[str, str] = {}
    delivery = output / "directions"
    delivery.mkdir()
    for row, (direction, name) in enumerate((("d", "down"), ("l", "left"), ("r", "right"), ("u", "up"))):
        strip = runtime.crop((0, row * 32, 128, (row + 1) * 32))
        strip_name = f"player-{name}-strip.png"
        strip.save(delivery / strip_name, optimize=True)
        strip.save(RUNTIME / "actors" / strip_name, optimize=True)
        frames = [gif_frame(strip.crop((column * 32, 0, (column + 1) * 32, 32))) for column in range(4)]
        gif_name = f"player-{name}.gif"
        frames[0].save(
            delivery / gif_name,
            save_all=True,
            append_images=frames[1:],
            duration=160,
            loop=0,
            disposal=2,
            transparency=0,
        )
        shutil.copy2(delivery / gif_name, RUNTIME / "actors" / gif_name)
        direction_strips[direction] = f"actors/{strip_name}"
        direction_gifs[direction] = f"actors/{gif_name}"
    actors["player"] = asset(
        "actors/player.png", prompt, 32, 32, 16, 4,
        directions=directions,
        directionStrips=direction_strips,
        directionGIFs=direction_gifs,
    )

    for actor_id, source_name in (("elder", "npc-elder-idle"), ("smith", "npc-smith-idle")):
        output, _, prompt = process_sheet(
            source_name, target="npc", mode="idle", rows=2, columns=2,
            cell_size=32, align="feet", max_body_scale_cv=0.08,
            max_anchor_y_std=0.05,
        )
        runtime = palette_image(Image.open(output / "sheet-transparent.png"), transparent=True)
        runtime.save(RUNTIME / "actors" / f"{actor_id}.png", optimize=True)
        actors[actor_id] = asset(f"actors/{actor_id}.png", prompt, 32, 32, 4, 2)
    return actors


def build_monsters() -> dict[str, dict[str, object]]:
    definitions = (
        ("slime", "monster-slime-idle", 2, "largest"),
        ("beetle", "monster-beetle-idle", 2, "largest"),
        ("wolf", "monster-wolf-idle", 2, "largest"),
        ("wolf_king", "monster-wolf-king-idle", 3, "largest"),
        ("slime_king", "monster-slime-king-idle", 3, "largest"),
        ("shade", "monster-shade-idle", 2, "largest"),
        ("gargoyle", "monster-gargoyle-idle", 2, "largest"),
        ("eclipse_golem", "monster-eclipse-golem-idle", 3, "largest"),
        ("wraith", "monster-wraith-idle", 2, "largest"),
        ("sentinel", "monster-sentinel-idle", 2, "largest"),
        ("eclipse_core", "monster-eclipse-core-idle", 3, "largest"),
    )
    monsters: dict[str, dict[str, object]] = {}
    for monster_id, source_name, grid, component_mode in definitions:
        output, _, prompt = process_sheet(
            source_name, target="creature", mode="idle", rows=grid, columns=grid,
            cell_size=32, align="bottom", component_mode=component_mode,
        )
        runtime = palette_image(Image.open(output / "sheet-transparent.png"), transparent=True)
        runtime.save(RUNTIME / "monsters" / f"{monster_id}.png", optimize=True)
        monsters[monster_id] = asset(
            f"monsters/{monster_id}.png", prompt, 32, 32, grid * grid, grid,
        )
    return monsters


def build_effects() -> dict[str, dict[str, object]]:
    definitions = (
        ("water-ripple", "fx-water-ripple", "idle", 16, "center", True),
        ("flame", "fx-flame", "idle", 16, "bottom", True),
        ("lava-bubble", "fx-lava-bubble", "idle", 16, "center", True),
        ("arcane-pulse", "fx-arcane-pulse", "idle", 16, "center", True),
        ("poof", "fx-poof", "impact", 32, "center", False),
        ("firework", "fx-firework", "impact", 32, "center", False),
    )
    effects: dict[str, dict[str, object]] = {}
    for effect_id, source_name, mode, cell_size, align, loop in definitions:
        output, _, prompt = process_sheet(
            source_name,
            target="asset",
            mode=mode,
            rows=2,
            columns=2,
            cell_size=cell_size,
            align=align,
            component_mode="all",
        )
        runtime = palette_image(Image.open(output / "sheet-transparent.png"), transparent=True)
        runtime.save(RUNTIME / "effects" / f"{effect_id}.png", optimize=True)
        effects[effect_id] = asset(
            f"effects/{effect_id}.png", prompt, cell_size, cell_size, 4, 2, loop=loop,
        )
    return effects


def extract_pack(
    source_name: str,
    *,
    cell_size: int,
    output_folder: str,
    names: tuple[str, ...],
    trim_border: int = 4,
) -> tuple[dict[str, dict[str, object]], str]:
    output, metadata, prompt = process_sheet(
        source_name, target="asset", mode="single", rows=4, columns=4,
        cell_size=cell_size, align="center", trim_border=trim_border,
    )
    labels = metadata["frame_labels"]
    entries: dict[str, dict[str, object]] = {}
    for index, name in enumerate(names):
        runtime = palette_image(Image.open(output / f"{labels[index]}.png"), transparent=True)
        destination = RUNTIME / output_folder / f"{name}.png"
        runtime.save(destination, optimize=True)
        entries[name] = asset(f"{output_folder}/{name}.png", prompt, cell_size, cell_size)
    return entries, prompt


def build_items() -> tuple[dict[str, dict[str, object]], dict[str, dict[str, object]]]:
    weapon_ids = (
        "wood_sword", "copper_dagger", "iron_sword", "long_spear",
        "battle_axe", "hero_sword", "flame_blade", "fang_blade",
        "moon_blade", "star_blade", "void_edge", "hunters_bow", "starlight_lance",
    )
    armor_ids = (
        "cloth_armor", "leather_armor", "chain_mail", "iron_armor",
        "dragon_scale", "shell_armor", "moon_ward", "aegis_dawn",
        "stone_plate", "eclipse_crown",
    )
    supply_ids = (
        "potion", "hi_potion", "haste_potion", "power_potion",
        "slime_gel", "beetle_shell", "wolf_fang", "meteor_shard", "void_crystal",
    )
    weapons, _ = extract_pack(
        "weapons-pack", cell_size=48, output_folder="weapons", names=weapon_ids,
    )
    armor, _ = extract_pack(
        "armor-pack", cell_size=24, output_folder="items", names=armor_ids,
    )
    supplies, _ = extract_pack(
        "supplies-pack", cell_size=24, output_folder="items", names=supply_ids,
        trim_border=0,
    )
    items = {**armor, **supplies}
    for weapon_id, weapon_asset in weapons.items():
        items[weapon_id] = dict(weapon_asset)
    return weapons, items


def main() -> None:
    recreate(PROCESSED)
    recreate(RUNTIME)
    for folder in ("tiles", "actors", "monsters", "weapons", "items", "effects", "prompts"):
        (RUNTIME / folder).mkdir()

    tiles = build_tiles()
    actors = build_actors()
    monsters = build_monsters()
    effects = build_effects()
    weapons, items = build_items()
    manifest = {
        "version": "poketown.rgb.v1",
        "palette": ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"],
        "tileSize": 16,
        "tiles": tiles,
        "tileEffects": {
            "W": "water-ripple", "y": "water-ripple",
            "^": "flame", "o": "flame",
            "l": "lava-bubble",
            "M": "arcane-pulse", "m": "arcane-pulse", "G": "arcane-pulse",
            ":": "arcane-pulse", "@": "arcane-pulse", "*": "arcane-pulse", "E": "arcane-pulse",
        },
        "actors": actors,
        "monsters": monsters,
        "weapons": weapons,
        "items": items,
        "effects": effects,
    }
    (RUNTIME / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    print(RUNTIME)


if __name__ == "__main__":
    main()
