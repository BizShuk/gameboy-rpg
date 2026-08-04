package server

// delta.go — 快照差分 (delta snapshot)
// 全量快照在人多時會浪費頻寬: 靜止不動的實體每 tick 仍整包重送。
// 這裡只送「與上一幀不同的實體」+ 消失的 id 清單, client 對本地表做套用。
// 每 deltaKeyframe ticks 送一次全量 (keyframe), 讓新進/丟幀的 client 收斂。

import (
	"maps"

	"github.com/bizshuk/game1/game"
)

// playerEq 玩家狀態是否相同。
// PlayerState 含 map 欄位, Go 禁止對這種型別用 == (靜態限制), 故逐欄比對。
func playerEq(a, b game.PlayerState) bool {
	return a.ID == b.ID && a.N == b.N && a.X == b.X && a.Y == b.Y && a.D == b.D &&
		a.HP == b.HP && a.MHP == b.MHP && a.G == b.G && a.W == b.W && a.A == b.A &&
		a.Bs == b.Bs && a.Ba == b.Ba && a.Q == b.Q && a.Pv == b.Pv && a.Dead == b.Dead &&
		maps.Equal(a.Iv, b.Iv)
}

// deltaKeyframe 全量快照間隔 (ticks; 20Hz → 每 2 秒)
const deltaKeyframe = 40

// DeltaMsg 下行差分快照 (t="st")
type DeltaMsg struct {
	T   string              `json:"t"`
	Key bool                `json:"key,omitempty"` // true = 全量 keyframe
	P   []game.PlayerState  `json:"p,omitempty"`
	M   []game.MonsterState `json:"m,omitempty"`
	Rp  []int64             `json:"rp,omitempty"` // 移除的玩家 id
	Rm  []int64             `json:"rm,omitempty"` // 移除的怪物 id
	E   []game.Event        `json:"e,omitempty"`
}

// deltaState 追蹤上一幀內容以計算差分
type deltaState struct {
	players  map[int64]game.PlayerState
	monsters map[int64]game.MonsterState
	ticks    int
}

func newDeltaState() *deltaState {
	return &deltaState{
		players:  map[int64]game.PlayerState{},
		monsters: map[int64]game.MonsterState{},
	}
}

// build 依目前快照產生差分訊息並更新追蹤狀態
func (d *deltaState) build(st game.State) DeltaMsg {
	d.ticks++
	key := d.ticks >= deltaKeyframe
	if key {
		d.ticks = 0
	}

	msg := DeltaMsg{T: "st", Key: key, E: st.E}
	seenP := make(map[int64]bool, len(st.P))
	for _, p := range st.P {
		seenP[p.ID] = true
		prev, had := d.players[p.ID]
		if key || !had || !playerEq(prev, p) {
			msg.P = append(msg.P, p)
		}
	}
	seenM := make(map[int64]bool, len(st.M))
	for _, m := range st.M {
		seenM[m.ID] = true
		if key || d.monsters[m.ID] != m {
			msg.M = append(msg.M, m)
		}
	}
	for id := range d.players {
		if !seenP[id] {
			msg.Rp = append(msg.Rp, id)
		}
	}
	for id := range d.monsters {
		if !seenM[id] {
			msg.Rm = append(msg.Rm, id)
		}
	}

	// 更新追蹤表 (Inv 需複製: World 會就地改動同一個 map)
	clear(d.players)
	for _, p := range st.P {
		p.Iv = maps.Clone(p.Iv)
		d.players[p.ID] = p
	}
	clear(d.monsters)
	for _, m := range st.M {
		d.monsters[m.ID] = m
	}
	return msg
}

// forceKeyframe 下一次 build 強制送全量 (新玩家入場時呼叫)
func (d *deltaState) forceKeyframe() { d.ticks = deltaKeyframe }
