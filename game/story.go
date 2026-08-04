package game

// story.go — 主線劇情《綠泉鎮與月光水晶》
// 資料驅動: Stages 任務鏈 + NPCs + 對話狀態機 (BuildDialog/DialogAction)
// 世界觀: 鎮中水井的月光水晶維持結界 (安全區的由來)。水晶黯淡, 野外生物
// 「月蝕化」暴走。玩家受村長之託採集證據、鍛造裝備、穿越北之森,
// 討伐月蝕狼王與神殿裡的暗影史萊姆王, 讓水晶復明。

import "fmt"

// StageDef 任務階段定義 (init 下發給 client 顯示追蹤器)
type StageDef struct {
	Q      int    `json:"q"`
	Title  string `json:"title"`
	Obj    string `json:"obj"`
	Kind   string `json:"kind"`             // talk | collect | reach | boss | done
	Target string `json:"target,omitempty"` // npc id / material id / boss kind
	N      int    `json:"n,omitempty"`      // collect 數量
	NPC    string `json:"npc,omitempty"`    // 交付對象 npc id
}

// Stages 主線八階段
var Stages = []StageDef{
	{Q: 0, Title: "不安的村莊", Obj: "與廣場的村長羅文對話", Kind: "talk", Target: "elder", NPC: "elder"},
	{Q: 1, Title: "凝膠的線索", Obj: "收集史萊姆凝膠交給村長 (西/南野區)", Kind: "collect", Target: "slime_gel", N: 5, NPC: "elder"},
	{Q: 2, Title: "鐵匠的材料", Obj: "收集甲蟲甲殼交給鐵匠 (東野區)", Kind: "collect", Target: "beetle_shell", N: 4, NPC: "smith"},
	{Q: 3, Title: "狼牙利刃", Obj: "收集狼牙交給鐵匠 (北野區)", Kind: "collect", Target: "wolf_fang", N: 3, NPC: "smith"},
	{Q: 4, Title: "北之森", Obj: "穿過北之森, 抵達月光神殿入口", Kind: "reach", Target: "shrine"},
	{Q: 5, Title: "月蝕狼王", Obj: "討伐西側獸穴的月蝕狼王", Kind: "boss", Target: "wolf_king"},
	{Q: 6, Title: "神殿之核", Obj: "進入神殿, 擊敗暗影史萊姆王", Kind: "boss", Target: "slime_king"},
	{Q: 7, Title: "水晶復明", Obj: "回到綠泉鎮向村長羅文回報", Kind: "talk", Target: "elder", NPC: "elder"},
	// ---- 第二章《星墜之淵》----
	{Q: 8, Title: "異變再起", Obj: "水晶之下傳來低鳴, 與村長羅文對話", Kind: "talk", Target: "elder", NPC: "elder"},
	{Q: 9, Title: "隕鐵碎片", Obj: "地下層收集隕鐵交給鐵匠 (神殿階梯下)", Kind: "collect", Target: "meteor_shard", N: 4, NPC: "smith"},
	{Q: 10, Title: "深淵之門", Obj: "持星隕劍抵達地下層最深處的深淵之門", Kind: "reach", Target: "abyss"},
	{Q: 11, Title: "封印之戰", Obj: "討伐深淵守護者「暗月魔像」", Kind: "boss", Target: "eclipse_golem"},
	{Q: 12, Title: "黎明", Obj: "回到地面向村長羅文回報", Kind: "talk", Target: "elder", NPC: "elder"},
	// ---- 第三章《月之彼端》----
	{Q: 13, Title: "門的另一側", Obj: "深淵之門仍在低鳴, 與村長羅文對話", Kind: "talk", Target: "elder", NPC: "elder"},
	{Q: 14, Title: "踏入裏側", Obj: "穿過深淵之門, 抵達月之裏側 (地下層最深處)", Kind: "reach", Target: "void"},
	{Q: 15, Title: "虛空結晶", Obj: "月之裏側收集虛空結晶交給鐵匠 (回地面)", Kind: "collect", Target: "void_crystal", N: 5, NPC: "smith"},
	{Q: 16, Title: "核心祭壇", Obj: "持虛空之刃抵達最深處的核心祭壇", Kind: "reach", Target: "core"},
	{Q: 17, Title: "月蝕根源", Obj: "討伐最終之敵「月蝕根源」(半血後會狂暴)", Kind: "boss", Target: "eclipse_core"},
	{Q: 18, Title: "真正的黎明", Obj: "回到綠泉鎮向村長羅文回報", Kind: "talk", Target: "elder", NPC: "elder"},
	{Q: 19, Title: "傳說完結", Obj: "三章全通! 你的名字寫進了綠泉鎮的史書", Kind: "done"},
}

// NPC 鎮民 (client 依 hero sprite 調色盤渲染)
type NPC struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	X    int    `json:"x"` // px 中心
	Y    int    `json:"y"`
	Pal  int    `json:"pal"` // hero 調色盤 index
}

// NPCs 村長羅文 (廣場水井旁) 與鐵匠布拉姆 (綠頂屋前)。
// 落點 tile 由 map_generator 生成 (map_gen.go 的 genNPCTiles)。
var NPCs = []NPC{
	{ID: "elder", Name: "村長羅文", X: genNPCTiles["elder"][0]*TileSize + 8, Y: genNPCTiles["elder"][1]*TileSize + 8, Pal: 8},
	{ID: "smith", Name: "鐵匠布拉姆", X: genNPCTiles["smith"][0]*TileSize + 8, Y: genNPCTiles["smith"][1]*TileSize + 8, Pal: 9},
}

// DlgAct 對話動作按鈕
type DlgAct struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Dlg 對話內容 (server → client)
type Dlg struct {
	NPC  string   `json:"npc"`
	Txt  string   `json:"txt"`
	Acts []DlgAct `json:"acts,omitempty"`
}

const talkRange = 2.5 * Unit // 對話距離 (人物單位)

func npcByID(id string) *NPC {
	for i := range NPCs {
		if NPCs[i].ID == id {
			return &NPCs[i]
		}
	}
	return nil
}

// nearNPC 玩家是否貼近指定 NPC
func nearNPC(p *Player, npcID string) bool {
	n := npcByID(npcID)
	return n != nil && dist(p.X, p.Y, float64(n.X), float64(n.Y)) < talkRange
}

// TalkNPC 與 NPC 對話: 依玩家劇情階段回傳對話內容
func (w *World) TalkNPC(pid int64, npcID string) *Dlg {
	p, ok := w.players[pid]
	if !ok || p.Dead() || !nearNPC(p, npcID) {
		return nil
	}
	n := npcByID(npcID)
	if n == nil {
		return nil
	}
	d := &Dlg{NPC: n.Name}
	switch npcID {
	case "elder":
		w.elderDialog(p, d)
	case "smith":
		w.smithDialog(p, d)
	}
	return d
}

func (w *World) elderDialog(p *Player, d *Dlg) {
	switch p.Quest {
	case 0:
		d.Txt = "旅人啊, 你來得正好。鎮中水井裡的月光水晶黯淡了——那是維持結界的心臟。圍籬外的生物一天比一天狂暴, 再這樣下去綠泉鎮撐不住……你願意幫我們查明真相嗎?"
		d.Acts = []DlgAct{{ID: "accept", Label: "我來調查 (接受任務)"}}
	case 1:
		if p.Inv["slime_gel"] >= 5 {
			d.Txt = "喔? 你帶回凝膠了, 快讓我看看。"
			d.Acts = []DlgAct{{ID: "turnin_gel", Label: "交出凝膠 x5"}}
		} else {
			d.Txt = fmt.Sprintf("先從最弱的下手。西邊與南邊草叢的史萊姆體內有凝膠, 帶 5 份回來, 我要驗驗牠們是否被污染了。(目前 %d/5)", p.Inv["slime_gel"])
		}
	case 2, 3:
		d.Txt = "鐵匠布拉姆在南邊綠頂屋前等你。要對付月蝕化的生物, 你需要更好的裝備。"
	case 4:
		d.Txt = "月光神殿在北之森深處。狼群把守著林道, 千萬小心。"
	case 5:
		d.Txt = "西側獸穴傳來狼嚎……那頭狼王就是森林異變的元凶之一。"
	case 6:
		d.Txt = "狼王倒下了? 剩下的就是神殿之核。願水晶護佑你, 勇者。"
	case 7:
		d.Txt = "水晶……水晶亮回來了! 你辦到了!"
		d.Acts = []DlgAct{{ID: "finale", Label: "回報討伐成果"}}
	case 8:
		d.Txt = "……你也聽見了嗎? 水晶復明那晚起, 神殿地板下傳來低鳴。先代勇者曾將「月蝕的根源」封印在神殿地下的深淵——恐怕封印正在鬆動。神殿裡的石階已經開啟了。"
		d.Acts = []DlgAct{{ID: "ch2_accept", Label: "繼續調查 (第二章開始)"}}
	case 9, 10:
		d.Txt = "地下層的階梯就在神殿裡。尋常刀劍傷不了深淵的東西——去找布拉姆, 他知道該怎麼辦。"
	case 11:
		d.Txt = "深淵之門後就是根源。守門的魔像是先代勇者的失敗之作……願月光與你同在。"
	case 12:
		d.Txt = "地鳴……停了。深淵安靜下來了!"
		d.Acts = []DlgAct{{ID: "finale2", Label: "回報封印成果"}}
	case 13:
		d.Txt = "……可是門還在低鳴。魔像只是鎖, 不是牆。先代勇者的手記寫著: 月蝕的根源不在深淵裡, 而在「門的另一側」——月之裏側。若不斬草除根, 一切終將重演。這一次, 我不能再送你去了……但我知道你會去。"
		d.Acts = []DlgAct{{ID: "ch3_accept", Label: "我去終結它 (第三章開始)"}}
	case 14, 15, 16, 17:
		d.Txt = "門已為你而開。願水晶的光, 照到那沒有光的地方。"
	case 18:
		d.Txt = "天亮了……真正的天亮了。水晶的光, 再也不會動搖。"
		d.Acts = []DlgAct{{ID: "finale3", Label: "回報最終戰果"}}
	default:
		d.Txt = "綠泉鎮的黎明, 是你帶回來的。孩子們會傳頌這個故事——勇者與月光水晶的故事。"
	}
}

func (w *World) smithDialog(p *Player, d *Dlg) {
	switch p.Quest {
	case 0, 1:
		d.Txt = "忙著呢……要打鐵, 先拿材料來。去找村長談談吧。"
	case 2:
		if p.Inv["beetle_shell"] >= 4 {
			d.Txt = "好傢伙, 這殼比鐵還硬。馬上給你打一件護甲!"
			d.Acts = []DlgAct{{ID: "craft_shell", Label: "打造甲殼護甲 (甲殼x4)"}}
		} else {
			d.Txt = fmt.Sprintf("東邊草原的鋼殼蟲, 甲殼硬得很。湊 4 片來, 我給你打一件「甲殼護甲」。(目前 %d/4)", p.Inv["beetle_shell"])
		}
	case 3:
		if p.Inv["wolf_fang"] >= 3 {
			d.Txt = "狼牙齊了。加 30G 工錢, 我把它打成削鐵如泥的快劍。"
			d.Acts = []DlgAct{{ID: "craft_fang", Label: "打造狼牙劍 (狼牙x3 + 30G)"}}
		} else {
			d.Txt = fmt.Sprintf("北邊的狼, 牙齒是最好的刃材。拿 3 顆狼牙來。(目前 %d/3)", p.Inv["wolf_fang"])
		}
	case 4, 5, 6:
		d.Txt = "裝備保養得不錯。月光神殿的入口在北之森盡頭——神殿的事就拜託了。"
	case 8:
		d.Txt = "長老跟你說了吧。深淵的東西, 得用天上掉下來的鐵才傷得了。先去接下調查吧。"
	case 9:
		if p.Inv["meteor_shard"] >= 4 && p.Gold >= 80 {
			d.Txt = "隕鐵……好傢伙, 還帶著星星的溫度。加 80G 工錢, 我給你打一把前所未見的劍。"
			d.Acts = []DlgAct{{ID: "craft_star", Label: "鍛造星隕劍 (隕鐵x4 + 80G)"}}
		} else {
			d.Txt = fmt.Sprintf("地下層的幽影與石像鬼身上帶著隕鐵碎片。收 4 塊來, 外加 80G 工錢。(目前 %d/4, 金幣 %d/80)", p.Inv["meteor_shard"], p.Gold)
		}
	case 10, 11, 12, 13, 14:
		d.Txt = "星隕劍就緒了。深淵之門在地下層最深處——魔像擋路就劈開它。"
	case 15:
		if p.Inv["void_crystal"] >= 5 && p.Gold >= 200 {
			d.Txt = "這結晶……握著像握住一段沒有聲音的夜。加 200G, 我把畢生的手藝都打進去。"
			d.Acts = []DlgAct{{ID: "craft_void", Label: "鍛造虛空之刃 (虛空結晶x5 + 200G)"}}
		} else {
			d.Txt = fmt.Sprintf("門另一側的東西身上有「虛空結晶」。帶 5 顆回來, 外加 200G。這一把, 會是我最後一件作品。(目前 %d/5, 金幣 %d/200)", p.Inv["void_crystal"], p.Gold)
		}
	case 16, 17:
		d.Txt = "虛空之刃在你手上。核心祭壇在裏側最深處——去吧, 別回頭。"
	default:
		d.Txt = "用隕鐵打出來的劍, 連星星都砍得下來。保重了, 勇者。"
	}
}

// DialogAction 執行對話動作 (接任務/交付/鍛造/結局)
func (w *World) DialogAction(pid int64, actID string) *Dlg {
	p, ok := w.players[pid]
	if !ok || p.Dead() {
		return nil
	}
	switch actID {
	case "accept":
		if p.Quest != 0 || !nearNPC(p, "elder") {
			return nil
		}
		w.advanceQuest(p, 1, "任務開始: 凝膠的線索")
		return &Dlg{NPC: "村長羅文", Txt: "謝謝你, 勇敢的旅人。史萊姆在西邊與南邊的草叢裡, 帶 5 份凝膠回來。"}
	case "turnin_gel":
		if p.Quest != 1 || !nearNPC(p, "elder") || p.Inv["slime_gel"] < 5 {
			return nil
		}
		p.Inv["slime_gel"] -= 5
		p.Gold += 40
		w.advanceQuest(p, 2, "任務完成: 凝膠的線索 (+40G)")
		return &Dlg{NPC: "村長羅文", Txt: "果然……凝膠裡有黑色紋路, 是「月蝕」的痕跡。這點謝禮收下 (+40G)。去找鐵匠布拉姆吧, 他在南邊的綠頂屋前。"}
	case "craft_shell":
		if p.Quest != 2 || !nearNPC(p, "smith") || p.Inv["beetle_shell"] < 4 {
			return nil
		}
		p.Inv["beetle_shell"] -= 4
		p.Armor = "shell_armor"
		w.advanceQuest(p, 3, "獲得裝備: Shell Armor (DEF+5)")
		return &Dlg{NPC: "鐵匠布拉姆", Txt: "穿上吧, 甲殼護甲! 接下來——北邊的狼, 牙齒是最好的刃材。拿 3 顆狼牙來。"}
	case "craft_fang":
		if p.Quest != 3 || !nearNPC(p, "smith") || p.Inv["wolf_fang"] < 3 || p.Gold < 30 {
			return nil
		}
		p.Inv["wolf_fang"] -= 3
		p.Gold -= 30
		p.Weapon = "fang_blade"
		w.advanceQuest(p, 4, "獲得裝備: Fang Blade (ATK+10)")
		return &Dlg{NPC: "鐵匠布拉姆", Txt: "這把「狼牙劍」削鐵如泥。月光神殿的入口在北之森盡頭——去吧, 我能做的都做了。"}
	case "finale":
		if p.Quest != 7 || !nearNPC(p, "elder") {
			return nil
		}
		p.Gold += 100
		p.Weapon = "moon_blade"
		w.advanceQuest(p, 8, "第一章完! 獲得傳說武器 Moon Blade")
		w.fireworks(p)
		return &Dlg{NPC: "村長羅文", Txt: "這把「月光劍」是先代勇者所留, 如今它屬於你 (+100G)。水晶復明, 結界重生——但願這就是故事的結局……"}
	case "ch2_accept":
		if p.Quest != 8 || !nearNPC(p, "elder") {
			return nil
		}
		w.advanceQuest(p, 9, "第二章開始: 星墜之淵")
		return &Dlg{NPC: "村長羅文", Txt: "神殿裡的石階通往地下層。那裡沒有月光, 只有火把與熔岩的光……帶上你最好的裝備。"}
	case "craft_star":
		if p.Quest != 9 || !nearNPC(p, "smith") || p.Inv["meteor_shard"] < 4 || p.Gold < 80 {
			return nil
		}
		p.Inv["meteor_shard"] -= 4
		p.Gold -= 80
		p.Weapon = "star_blade"
		w.advanceQuest(p, 10, "獲得神兵: Star Blade (ATK+26)")
		return &Dlg{NPC: "鐵匠布拉姆", Txt: "「星隕劍」——我這輩子最好的作品。去吧, 深淵之門在地下層最深處等你。"}
	case "finale2":
		if p.Quest != 12 || !nearNPC(p, "elder") {
			return nil
		}
		p.Gold += 150
		p.Armor = "moon_ward"
		w.advanceQuest(p, 13, "第二章完! 獲得傳說護甲 Moon Ward")
		w.fireworks(p)
		return &Dlg{NPC: "村長羅文", Txt: "深淵封印重鑄了。這件「月光護甲」織入了水晶的光 (+150G)。只是……門, 還在低鳴。"}
	case "ch3_accept":
		if p.Quest != 13 || !nearNPC(p, "elder") {
			return nil
		}
		w.advanceQuest(p, 14, "第三章開始: 月之彼端")
		return &Dlg{NPC: "村長羅文", Txt: "深淵之門已認得你的劍痕, 會為你敞開。門後沒有大地, 只有浮在虛空裡的碎片與星光……走穩了, 勇者。"}
	case "craft_void":
		if p.Quest != 15 || !nearNPC(p, "smith") || p.Inv["void_crystal"] < 5 || p.Gold < 200 {
			return nil
		}
		p.Inv["void_crystal"] -= 5
		p.Gold -= 200
		p.Weapon = "void_edge"
		w.advanceQuest(p, 16, "獲得神兵: Void Edge (ATK+34)")
		return &Dlg{NPC: "鐵匠布拉姆", Txt: "「虛空之刃」。它連黑暗都切得開——我這雙手, 再打不出更好的了。去終結它吧。"}
	case "finale3":
		if p.Quest != 18 || !nearNPC(p, "elder") {
			return nil
		}
		p.Gold += 500
		p.Armor = "aegis_dawn"
		w.advanceQuest(p, 19, "三章全通! 獲得傳說護甲 Aegis of Dawn")
		w.fireworks(p)
		return &Dlg{NPC: "村長羅文", Txt: "月蝕的根源消散了, 這一次是徹底地。這面「黎明之盾」以水晶最後的光鑄成, 從此換它守著你 (+500G)。綠泉鎮的史書上, 第一頁就是你的名字。"}
	}
	return nil
}

// advanceQuest 推進劇情並通知該玩家 (qmsg 橫幅)
func (w *World) advanceQuest(p *Player, to int, banner string) {
	p.Quest = to
	w.queueMsg(p.ID, "qmsg", banner)
	if to < len(Stages) {
		w.queueMsg(p.ID, "msg", "新目標: "+Stages[to].Obj)
	}
}

// questTick 每 tick 檢查抵達型目標 (S4 神殿入口 / S10 深淵之門)
func (w *World) questTick(p *Player) {
	if p.Dead() {
		return
	}
	if p.Quest == 4 && InRect(ShrineGate, p.X, p.Y) {
		w.advanceQuest(p, 5, "抵達月光神殿! 西側獸穴傳來狼嚎……")
	}
	if p.Quest == 10 && InRect(AbyssGate, p.X, p.Y) {
		w.advanceQuest(p, 11, "深淵之門在前——守護者「暗月魔像」甦醒了!")
	}
	if p.Quest == 14 && w.Map.InVoid(p.Y) {
		w.advanceQuest(p, 15, "這裡是月之裏側——沒有大地, 只有星光與碎片。")
	}
	if p.Quest == 16 && InRect(CoreAltar, p.X, p.Y) {
		w.advanceQuest(p, 17, "核心祭壇——月蝕根源甦醒了!")
	}
}

// onBossKill Boss 討伐劇情推進: 擊殺者 + 320px 內同階段玩家都算討伐成功
func (w *World) onBossKill(mo *Monster, killer *Player) {
	k := Kinds[mo.Kind]
	if !k.Boss {
		return
	}
	var stage, next int
	var banner string
	switch mo.Kind {
	case "wolf_king":
		stage, next, banner = 5, 6, "月蝕狼王倒下了! 神殿的大門就在眼前。"
	case "slime_king":
		stage, next, banner = 6, 7, "暗影史萊姆王消散了! 快回去向村長羅文回報!"
	case "eclipse_golem":
		stage, next, banner = 11, 12, "暗月魔像崩解了! 深淵歸於寂靜——回去找村長羅文!"
	case "eclipse_core":
		stage, next, banner = 17, 18, "月蝕根源消散於星光之中……回到綠泉鎮, 告訴大家天亮了。"
	default:
		return
	}
	const creditRange = 20 * Unit // 共鬥判定距離
	for _, p := range w.players {
		if p.Quest != stage {
			continue
		}
		if p.ID == killer.ID || dist(p.X, p.Y, mo.X, mo.Y) < creditRange {
			w.advanceQuest(p, next, banner)
		}
	}
}

// fireworks 結局慶典煙火 (廣場與玩家周圍)
func (w *World) fireworks(p *Player) {
	for i := range 8 {
		w.events = append(w.events, Event{
			K: "fw",
			X: int(p.X) + (i%4)*40 - 60 + w.rng.IntN(30),
			Y: int(p.Y) - 20 - (i/4)*50 + w.rng.IntN(30),
			V: i * 12, // 延遲節拍 (client 以 V*10ms 錯開)
		})
	}
}
