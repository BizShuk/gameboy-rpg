# Material Sprite Library

This directory contains generated map materials grouped by subdomain.

## Layout

```text
materials/<subdomain>/<material>/<material>.png
materials/<subdomain>/<material>/<material>.json
```

There are 5 subdomains and 50 materials. The runtime catalog is `index.json`. Each PNG is an `896×128` RGBA horizontal sprite sheet containing seven `128×128` cells in this order:

```text
left | right | up | down | attack | defense | sit
```

Each JSON file uses the atlas-compatible `objects` map with keys in the form `<material>:<state>`.

The four directional states correspond to the existing `MapObject.rotation` mapping: `0 → left`, `1 → right`, `2 → up`, `3 → down`. The three action states are selected through `MapObject.attrs.action` in the Inspector.

At boot, `apps/editor/src/main/materialAssets.ts` loads this catalog into `MaterialAtlas`. Generated material lookup has priority over the legacy `tileset.webp` / `tileset_extra.webp` atlases. The old atlas remains a fallback if a generated sheet or manifest fails to load; the same rule suppresses `portal.gif` when the generated `portal` sheet is available.
