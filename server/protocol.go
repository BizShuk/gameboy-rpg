package server

// protocol.go — WebSocket 線上訊息格式 (wire protocol, JSON)

import "github.com/bizshuk/game1/game"

// ClientMsg 客戶端上行訊息
//
//	t=join   加入遊戲 (name)
//	t=in     輸入狀態 (up/dn/lf/rt)
//	t=atk    攻擊 (edge trigger)
//	t=buy    購買 (id = item id)
//	t=use    使用藥水 (id)
//	t=pvp    切換野區決鬥模式
//	t=talk   與 NPC 對話 (id = npc id)
//	t=dlgact 對話動作 (id = action id)
type ClientMsg struct {
	T    string `json:"t"`
	Name string `json:"name,omitempty"`
	Up   bool   `json:"up,omitempty"`
	Dn   bool   `json:"dn,omitempty"`
	Lf   bool   `json:"lf,omitempty"`
	Rt   bool   `json:"rt,omitempty"`
	ID   string `json:"id,omitempty"`
}

// InitMsg 下行：入場資料 (地圖、商店、NPC、劇情表、自身 id)
type InitMsg struct {
	T     string                      `json:"t"` // "init"
	ID    int64                       `json:"id"`
	Tile  int                         `json:"tile"`
	W     int                         `json:"w"`
	H     int                         `json:"h"`
	Rows  []string                    `json:"rows"`
	Safe  [][4]int                    `json:"safe"` // 安全區 tile rects (x1,y1,x2,y2)
	DTop  int                         `json:"dtop"` // 地下層起始 row (dungeonTopRow)
	VTop  int                         `json:"vtop"` // 月之裏側起始 row (voidTopRow)
	Shop  []game.Item                 `json:"shop"`
	Kinds map[string]game.MonsterKind `json:"kinds"`
	NPCs  []game.NPC                  `json:"npcs"`
	Story []game.StageDef             `json:"story"`
}

// DlgMsg 下行：NPC 對話
type DlgMsg struct {
	T string `json:"t"` // "dlg"
	game.Dlg
}

// StateMsg 下行：每 tick 世界快照
type StateMsg struct {
	T string `json:"t"` // "st"
	game.State
}

// TextMsg 下行：提示訊息 (t="msg" toast / t="qmsg" 劇情橫幅)
type TextMsg struct {
	T   string `json:"t"`
	Txt string `json:"txt"`
}
