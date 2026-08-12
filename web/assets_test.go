package web_test

import (
	"encoding/json"
	"image"
	_ "image/gif"
	_ "image/png"
	"io/fs"
	"regexp"
	"strings"
	"testing"

	"github.com/bizshuk/gameboy-rpg/game"
	gameweb "github.com/bizshuk/gameboy-rpg/web"
)

type artAsset struct {
	File            string            `json:"file"`
	Prompt          string            `json:"prompt"`
	FrameWidth      int               `json:"frameWidth"`
	FrameHeight     int               `json:"frameHeight"`
	Frames          int               `json:"frames"`
	Columns         int               `json:"columns"`
	Directions      map[string][]int  `json:"directions,omitempty"`
	DirectionStrips map[string]string `json:"directionStrips,omitempty"`
	DirectionGIFs   map[string]string `json:"directionGIFs,omitempty"`
}

type artManifest struct {
	Version     string              `json:"version"`
	Palette     []string            `json:"palette"`
	TileSize    int                 `json:"tileSize"`
	Tiles       map[string]artAsset `json:"tiles"`
	TileEffects map[string]string   `json:"tileEffects"`
	Actors      map[string]artAsset `json:"actors"`
	Monsters    map[string]artAsset `json:"monsters"`
	Weapons     map[string]artAsset `json:"weapons"`
	Items       map[string]artAsset `json:"items"`
	Effects     map[string]artAsset `json:"effects"`
}

func loadArtManifest(t *testing.T) (fs.FS, artManifest) {
	t.Helper()
	static := gameweb.FS()
	b, err := fs.ReadFile(static, "assets/rgb/manifest.json")
	if err != nil {
		t.Fatalf("read RGB art manifest: %v", err)
	}
	var manifest artManifest
	if err := json.Unmarshal(b, &manifest); err != nil {
		t.Fatalf("parse RGB art manifest: %v", err)
	}
	return static, manifest
}

func requireAsset(t *testing.T, static fs.FS, palette map[string]bool, name string, asset artAsset) {
	t.Helper()
	if asset.File == "" || asset.Prompt == "" {
		t.Fatalf("%s must declare file and prompt provenance", name)
	}
	if asset.FrameWidth <= 0 || asset.FrameHeight <= 0 || asset.Frames <= 0 || asset.Columns <= 0 {
		t.Fatalf("%s has invalid frame contract: %+v", name, asset)
	}
	if _, err := fs.Stat(static, "assets/rgb/"+asset.Prompt); err != nil {
		t.Fatalf("%s prompt %q: %v", name, asset.Prompt, err)
	}
	f, err := static.Open("assets/rgb/" + asset.File)
	if err != nil {
		t.Fatalf("%s image %q: %v", name, asset.File, err)
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		t.Fatalf("decode %s: %v", name, err)
	}
	bounds := img.Bounds()
	rows := (asset.Frames + asset.Columns - 1) / asset.Columns
	if bounds.Dx() != asset.FrameWidth*asset.Columns || bounds.Dy() != asset.FrameHeight*rows {
		t.Fatalf("%s dimensions %dx%d do not match %dx%d frames=%d columns=%d", name, bounds.Dx(), bounds.Dy(), asset.FrameWidth, asset.FrameHeight, asset.Frames, asset.Columns)
	}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a == 0 {
				continue
			}
			if a != 0xffff {
				t.Fatalf("%s contains partial alpha at %d,%d", name, x, y)
			}
			hex := strings.ToUpper("#" + hexByte(r>>8) + hexByte(g>>8) + hexByte(b>>8))
			if !palette[hex] {
				t.Fatalf("%s uses color %s outside the four-shade palette", name, hex)
			}
		}
	}
}

func hexByte(v uint32) string {
	const digits = "0123456789ABCDEF"
	return string([]byte{digits[(v>>4)&0xf], digits[v&0xf]})
}

func TestPokemonRGBArtManifestCoversEveryRuntimeObject(t *testing.T) {
	static, manifest := loadArtManifest(t)
	if manifest.Version != "poketown.rgb.v1" {
		t.Fatalf("manifest version = %q", manifest.Version)
	}
	wantPalette := []string{"#0F380F", "#306230", "#8BAC0F", "#9BBC0F"}
	if len(manifest.Palette) != len(wantPalette) {
		t.Fatalf("palette = %v", manifest.Palette)
	}
	palette := make(map[string]bool, len(wantPalette))
	for i, color := range wantPalette {
		if strings.ToUpper(manifest.Palette[i]) != color {
			t.Fatalf("palette[%d] = %q, want %q", i, manifest.Palette[i], color)
		}
		palette[color] = true
	}
	if manifest.TileSize != game.TileSize {
		t.Fatalf("manifest tileSize = %d, want %d", manifest.TileSize, game.TileSize)
	}

	seenTiles := map[rune]bool{}
	for _, row := range game.NewTileMap().Rows {
		for _, tile := range row {
			seenTiles[tile] = true
		}
	}
	for tile := range seenTiles {
		asset, ok := manifest.Tiles[string(tile)]
		if !ok {
			t.Errorf("tile %q has no RGB asset", tile)
			continue
		}
		requireAsset(t, static, palette, "tile "+string(tile), asset)
	}

	for _, actor := range append([]string{"player"}, npcIDs()...) {
		asset, ok := manifest.Actors[actor]
		if !ok {
			t.Errorf("actor %q has no RGB asset", actor)
			continue
		}
		requireAsset(t, static, palette, "actor "+actor, asset)
	}
	for kind := range game.Kinds {
		asset, ok := manifest.Monsters[kind]
		if !ok {
			t.Errorf("monster %q has no RGB asset", kind)
			continue
		}
		requireAsset(t, static, palette, "monster "+kind, asset)
	}
	for _, item := range game.ShopItems {
		asset, ok := manifest.Items[item.ID]
		if !ok {
			t.Errorf("item %q has no RGB icon", item.ID)
			continue
		}
		requireAsset(t, static, palette, "item "+item.ID, asset)
		if item.Kind == game.KindWeapon {
			weapon, ok := manifest.Weapons[item.ID]
			if !ok {
				t.Errorf("weapon %q has no RGB world asset", item.ID)
				continue
			}
			requireAsset(t, static, palette, "weapon "+item.ID, weapon)
		}
	}
}

func TestPokemonRGBArtManifestProvidesAuthoredAnimations(t *testing.T) {
	static, manifest := loadArtManifest(t)
	palette := make(map[string]bool, len(manifest.Palette))
	for _, color := range manifest.Palette {
		palette[strings.ToUpper(color)] = true
	}

	wantEffects := []string{
		"water-ripple",
		"flame",
		"lava-bubble",
		"arcane-pulse",
		"poof",
		"firework",
	}
	for _, effect := range wantEffects {
		asset, ok := manifest.Effects[effect]
		if !ok {
			t.Errorf("effect %q has no authored RGB sprite sheet", effect)
			continue
		}
		requireAsset(t, static, palette, "effect "+effect, asset)
	}

	wantTileEffects := map[string]string{
		"W": "water-ripple", "y": "water-ripple",
		"^": "flame", "o": "flame",
		"l": "lava-bubble",
		"M": "arcane-pulse", "m": "arcane-pulse", "G": "arcane-pulse",
		":": "arcane-pulse", "@": "arcane-pulse", "*": "arcane-pulse", "E": "arcane-pulse",
	}
	for tile, effect := range wantTileEffects {
		if got := manifest.TileEffects[tile]; got != effect {
			t.Errorf("tile effect %q = %q, want %q", tile, got, effect)
		}
	}
}

func TestPlayerArtProvidesDirectionalDeliveryExports(t *testing.T) {
	static, manifest := loadArtManifest(t)
	player := manifest.Actors["player"]
	for _, direction := range []string{"d", "l", "r", "u"} {
		strip := player.DirectionStrips[direction]
		if strip == "" {
			t.Errorf("player direction %q has no strip export", direction)
		} else {
			requireImageDimensions(t, static, strip, 128, 32)
		}
		animation := player.DirectionGIFs[direction]
		if animation == "" {
			t.Errorf("player direction %q has no GIF export", direction)
		} else {
			requireImageDimensions(t, static, animation, 32, 32)
		}
	}
}

func requireImageDimensions(t *testing.T, static fs.FS, file string, width, height int) {
	t.Helper()
	f, err := static.Open("assets/rgb/" + file)
	if err != nil {
		t.Fatalf("open delivery export %q: %v", file, err)
	}
	defer f.Close()
	config, _, err := image.DecodeConfig(f)
	if err != nil {
		t.Fatalf("decode delivery export %q: %v", file, err)
	}
	if config.Width != width || config.Height != height {
		t.Fatalf("delivery export %q dimensions = %dx%d, want %dx%d", file, config.Width, config.Height, width, height)
	}
}

func npcIDs() []string {
	ids := make([]string, 0, len(game.NPCs))
	for _, npc := range game.NPCs {
		ids = append(ids, npc.ID)
	}
	return ids
}

func TestLegacyVisualClientsAreRemoved(t *testing.T) {
	static := gameweb.FS()
	for _, obsolete := range []string{
		"iso/index.html",
		"assets/materials/index.json",
		"assets/portal.gif",
		"assets/tileset.webp",
		"assets/tileset_extra.webp",
	} {
		if _, err := fs.Stat(static, obsolete); err == nil {
			t.Errorf("legacy visual asset still exists: %s", obsolete)
		}
	}
	index, err := fs.ReadFile(static, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(index), "/iso/") {
		t.Fatal("join screen still links to legacy isometric client")
	}
	artIndex := strings.Index(string(index), `<script src="art.js"></script>`)
	clientIndex := strings.Index(string(index), `<script src="client.js"></script>`)
	if artIndex < 0 || clientIndex < 0 || artIndex > clientIndex {
		t.Fatal("canonical art registry must load before gameplay client")
	}
	client, err := fs.ReadFile(static, "client.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, obsolete := range []string{"function makeSprite(", "const HERO =", "const WEAPON_ART =", "function drawGrassBase("} {
		if strings.Contains(string(client), obsolete) {
			t.Errorf("legacy procedural visual path remains: %s", obsolete)
		}
	}
	if !strings.Contains(string(client), "assets/rgb/manifest.json") {
		t.Fatal("client does not load the canonical RGB asset manifest")
	}
	if !strings.Contains(string(client), `RGBArt.frame("effects"`) {
		t.Fatal("client does not render authored effect sprite sheets")
	}
	for _, obsolete := range []string{`e.type === "poof"`, `e.type === "fw"`} {
		if strings.Contains(string(client), obsolete) {
			t.Errorf("procedural sprite-like effect remains: %s", obsolete)
		}
	}
}

func TestRuntimeVisualCodeUsesOnlyGameBoyPalette(t *testing.T) {
	static := gameweb.FS()
	allowed := map[string]bool{
		"#0F380F": true,
		"#306230": true,
		"#8BAC0F": true,
		"#9BBC0F": true,
	}
	hexColor := regexp.MustCompile(`#[0-9a-fA-F]{6}`)
	for _, name := range []string{"art.js", "client.js", "style.css"} {
		content, err := fs.ReadFile(static, name)
		if err != nil {
			t.Fatal(err)
		}
		for _, color := range hexColor.FindAllString(string(content), -1) {
			if !allowed[strings.ToUpper(color)] {
				t.Errorf("%s uses color %s outside the Game Boy palette", name, color)
			}
		}
	}
}
