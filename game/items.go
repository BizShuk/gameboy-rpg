package game

// items.go — 裝備與道具定義 (weapons, armor, consumables, two stores)

// ItemKind 道具類別
type ItemKind string

const (
	KindWeapon   ItemKind = "weapon"
	KindArmor    ItemKind = "armor"
	KindPotion   ItemKind = "potion"
	KindMaterial ItemKind = "material" // 怪物掉落素材 (劇情/鍛造用)
)

// 商店歸屬 (store)
const (
	StoreWeapon = "weapon" // 武器店 (櫃檯 'C')
	StoreGear   = "gear"   // 道具店 (櫃檯 'A'): 防具 + 消耗品
	StoreCraft  = "craft"  // 非賣品: 劇情鍛造/獎勵 (不出現在商店)
)

// 徒手預設攻擊參數 (無武器時; Reach/Radius 以人物單位 unit 表達)
const (
	FistCD     = 7   // ticks
	FistReach  = 0.9 // 觸點距離 (unit)
	FistRadius = 1.1 // 判定半徑 (unit)
)

// Item 商店販售品
//
//	武器: Atk 加成 + CD 攻速 + Reach 觸點距離 + Radius 判定半徑
//	      (Reach/Radius 單位 = 人物 unit; 0 用徒手預設)
//	防具: Def 加成
//	消耗品: Heal 回血, 或 SpeedPct/AtkBuff + BuffSec 的限時 buff
type Item struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Kind     ItemKind `json:"kind"`
	Store    string   `json:"store"`
	Price    int      `json:"price"`
	Atk      int      `json:"atk,omitempty"`
	Def      int      `json:"def,omitempty"`
	Heal     int      `json:"heal,omitempty"`
	CD       int      `json:"cd,omitempty"`
	Reach    float64  `json:"reach,omitempty"`
	Radius   float64  `json:"radius,omitempty"`
	SpeedPct int      `json:"speedPct,omitempty"`
	AtkBuff  int      `json:"atkBuff,omitempty"`
	BuffSec  int      `json:"buffSec,omitempty"`
}

// ShopItems 全品項 (client 依 store 過濾顯示)
var ShopItems = []Item{
	// 武器店 — 攻速與範圍各有取捨 (Reach/Radius: 人物單位)
	{ID: "wood_sword", Name: "Wood Sword", Kind: KindWeapon, Store: StoreWeapon, Atk: 3, CD: 7, Price: 20},
	{ID: "copper_dagger", Name: "Copper Dagger", Kind: KindWeapon, Store: StoreWeapon, Atk: 4, CD: 4, Reach: 0.75, Price: 45},
	{ID: "iron_sword", Name: "Iron Sword", Kind: KindWeapon, Store: StoreWeapon, Atk: 7, CD: 7, Price: 70},
	{ID: "long_spear", Name: "Long Spear", Kind: KindWeapon, Store: StoreWeapon, Atk: 8, CD: 8, Reach: 1.5, Price: 110},
	{ID: "battle_axe", Name: "Battle Axe", Kind: KindWeapon, Store: StoreWeapon, Atk: 12, CD: 11, Radius: 1.6, Price: 160},
	{ID: "hero_sword", Name: "Hero Sword", Kind: KindWeapon, Store: StoreWeapon, Atk: 13, CD: 6, Price: 220},
	{ID: "flame_blade", Name: "Flame Blade", Kind: KindWeapon, Store: StoreWeapon, Atk: 18, CD: 7, Radius: 1.4, Price: 320},
	// 道具店 — 防具
	{ID: "cloth_armor", Name: "Cloth Armor", Kind: KindArmor, Store: StoreGear, Def: 1, Price: 15},
	{ID: "leather_armor", Name: "Leather Armor", Kind: KindArmor, Store: StoreGear, Def: 3, Price: 45},
	{ID: "chain_mail", Name: "Chain Mail", Kind: KindArmor, Store: StoreGear, Def: 5, Price: 90},
	{ID: "iron_armor", Name: "Iron Armor", Kind: KindArmor, Store: StoreGear, Def: 7, Price: 150},
	{ID: "dragon_scale", Name: "Dragon Scale", Kind: KindArmor, Store: StoreGear, Def: 10, Price: 280},
	// 道具店 — 消耗品
	{ID: "potion", Name: "Potion", Kind: KindPotion, Store: StoreGear, Heal: 30, Price: 10},
	{ID: "hi_potion", Name: "Hi-Potion", Kind: KindPotion, Store: StoreGear, Heal: 999, Price: 35},
	{ID: "haste_potion", Name: "Haste Potion", Kind: KindPotion, Store: StoreGear, SpeedPct: 40, BuffSec: 10, Price: 25},
	{ID: "power_potion", Name: "Power Potion", Kind: KindPotion, Store: StoreGear, AtkBuff: 6, BuffSec: 12, Price: 30},
	// 劇情素材 (怪物掉落)
	{ID: "slime_gel", Name: "凝膠", Kind: KindMaterial, Store: StoreCraft},
	{ID: "beetle_shell", Name: "甲殼", Kind: KindMaterial, Store: StoreCraft},
	{ID: "wolf_fang", Name: "狼牙", Kind: KindMaterial, Store: StoreCraft},
	{ID: "meteor_shard", Name: "隕鐵", Kind: KindMaterial, Store: StoreCraft},
	{ID: "void_crystal", Name: "虛空結晶", Kind: KindMaterial, Store: StoreCraft},
	// 劇情裝備 (鍛造/獎勵取得)
	{ID: "shell_armor", Name: "Shell Armor", Kind: KindArmor, Store: StoreCraft, Def: 5},
	{ID: "fang_blade", Name: "Fang Blade", Kind: KindWeapon, Store: StoreCraft, Atk: 10, CD: 6},
	{ID: "moon_blade", Name: "Moon Blade", Kind: KindWeapon, Store: StoreCraft, Atk: 20, CD: 6, Radius: 1.25},
	{ID: "star_blade", Name: "Star Blade", Kind: KindWeapon, Store: StoreCraft, Atk: 26, CD: 6, Radius: 1.5},
	{ID: "moon_ward", Name: "Moon Ward", Kind: KindArmor, Store: StoreCraft, Def: 12},
	// 第三章傳說裝備
	{ID: "void_edge", Name: "Void Edge", Kind: KindWeapon, Store: StoreCraft, Atk: 34, CD: 5, Reach: 1.3, Radius: 1.8},
	{ID: "aegis_dawn", Name: "Aegis of Dawn", Kind: KindArmor, Store: StoreCraft, Def: 16},
	// 稀有掉落 (非商店取得; 由怪物機率掉落, 優於現有裝備時自動裝上)
	{ID: "hunters_bow", Name: "Hunter's Bow", Kind: KindWeapon, Store: StoreCraft, Atk: 9, CD: 5, Reach: 2.2},
	{ID: "stone_plate", Name: "Stone Plate", Kind: KindArmor, Store: StoreCraft, Def: 9},
	{ID: "starlight_lance", Name: "Starlight Lance", Kind: KindWeapon, Store: StoreCraft, Atk: 22, CD: 6, Reach: 2.0},
	{ID: "eclipse_crown", Name: "Eclipse Crown", Kind: KindArmor, Store: StoreCraft, Def: 20},
}

// ItemByID 查表；查無回傳 nil
func ItemByID(id string) *Item {
	for i := range ShopItems {
		if ShopItems[i].ID == id {
			return &ShopItems[i]
		}
	}
	return nil
}
