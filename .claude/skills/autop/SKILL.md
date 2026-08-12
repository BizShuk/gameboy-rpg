---
name: autop
description: Use when running or scripting the `autop` CLI facade — launching a local LLM CLI (agy, claude/claudem/claudew/claudep, codex, grok) through one entry point, choosing a client with -c, applying a prompt template with -t, overriding model/effort, bypassing CLI permission prompts, inspecting or editing ~/.config/autop settings, or registering an autop PM2 task via `autop wizard`. Triggers on "autop", "跑 autop", "用 codex/claude 跑這個 prompt", "autop wizard", "autop config", "ecosystem.config.js autop task".
---

# autop CLI

## Overview

`autop` 是 Go 寫的 LLM CLI façade (門面)：依設定選一個 client profile，把 prompt、
model、effort、workspace 映射成本機 `agy` / `claude` / `codex` / `grok` 的 argv，
再用 `exec` 直接啟動該 CLI。它`不呼叫 provider API`，也不保存 credential。

Source of truth：`~/projects/tools/autop`（`README.md`、`CLAUDE.md`、
`docs/terminology.md`）。Runtime 設定：`~/.config/autop/settings.json`。

## When to Use

- 要用單一指令跑不同 LLM CLI，或在 script／PM2 task 裡跑非互動 prompt。
- 要把同一個 prompt 套 template 送給不同 driver（Codex 用 `$skill`，其餘用 `/skill`）。
- 要建立或更新 workspace root 的 `ecosystem.config.js` autop task（`autop wizard`）。

When NOT to use：需要互動式 session（直接開 `claude` / `codex`）、或要改 autop 自身
Go 原始碼（那是一般 Go 開發，走 golang-dev）。

## Quick Reference

| 目的                        | 指令                                                  |
| --------------------------- | ----------------------------------------------------- |
| 用 default client 跑 prompt | `autop -- 'summarize current workspace'`              |
| 指定 client                 | `autop -c claudem -- 'review workspace'`              |
| 從 stdin 餵 prompt          | `printf '%s' 'do X' \| autop -c codex`                |
| 套 template                 | `autop -c codex -t system`                            |
| 覆寫 model／effort          | `autop -c codex --model gpt-5.5 --effort high -- 'x'` |
| 允許危險權限                | `autop -c codex --bypass-permission=true -- 'x'`      |
| 只印命令不執行              | `autop --dry-run -c codex -t system`                  |
| 建 PM2 task                 | `autop wizard`（alias `autop w`）                     |
| 看合併設定                  | `autop config` / `autop config --source`              |
| 寫入預設設定檔              | `autop config default`（升級後補欄位用 `--merge`）    |
| 改單一設定值                | `autop config --update clients.codex.model=gpt-5.5`   |

Root flags 只有七個：`-c/--client`、`-t/--template`、`--model`、`--effort`、
`--bypass-permission`、`--dry-run`、`-h`。沒有 `-p`、沒有 `--cwd`；workspace 一律是
目前 working directory。

`--dry-run` 把解析後的 command line 印到 stdout 就結束：不啟動 CLI，也不做 settings
檔與 credential 檢查，所以 API key 還沒設定時照樣能預覽。Credential 以
`TARGET="$SOURCE"` 顯示，永遠不會印出 secret 值。

## Prompt 輸入規則

- Prompt 可來自 positional arguments 或 piped stdin，`兩者同時提供會直接報錯`。
- Prompt 以 `-` 或 `/` 開頭時，前面要加 `--`，否則 Cobra 會當成 flag。
- 沒有 `-t` 時 prompt 必填；有 `-t` 時 prompt 可省略，template 自行產生內容。
- Positional arguments 會用空白 join，所以整段 prompt 建議用單引號包成一個 argument。

## Client 與 driver mapping

| Client    | Driver | Executable                  | Credential                                        |
| --------- | ------ | --------------------------- | ------------------------------------------------- |
| `agy`     | agy    | `agy`                       | OAuth                                             |
| `codex`   | codex  | `codex exec`                | OAuth                                             |
| `grok`    | grok   | `grok`                      | OAuth                                             |
| `claude`  | claude | `claude`                    | OAuth                                             |
| `claudem` | claude | `claude` + minimax settings | `MINIMAX_API_KEY` → `ANTHROPIC_AUTH_TOKEN`        |
| `claudew` | claude | `claude` + llmbox settings  | `TIKTOK_API_KEY` → `ANTHROPIC_AUTH_TOKEN`         |
| `claudep` | claude | `claude` + proxy settings   | `AGENTSDK_PROXY_API_KEY` → `ANTHROPIC_AUTH_TOKEN` |
| `claudet` | claude | —                           | `disabled: true`，選了會報錯                      |

Workspace 傳遞方式各 driver 不同：agy 與 Claude family 用 `--add-dir <cwd>`，
Codex 用 `-C <cwd>`，Grok 用 `--cwd <cwd>`。Model／effort 只接受該 profile
`models`／`efforts` 清單內的值，否則 `client "x" does not support model "y"`。

Claude family profile 的 `settings` 檔在啟動前會被檢查；檔案不存在時直接報
`client "x" settings file <path> does not exist` 並中止，不會啟動 CLI。`agy`、
`codex`、`grok` 不需要 settings 檔，跳過這道檢查。

## Permission bypass（最常見的誤解）

設定裡的 `auto_approve: true` `只是 wizard 的預設選項`。直接執行時必須明確給
`--bypass-permission=true`，才會加上 provider 的危險 flag：

| Driver           | Flag                                         |
| ---------------- | -------------------------------------------- |
| `agy` / `claude` | `--dangerously-skip-permissions`             |
| `codex`          | `--dangerously-bypass-approvals-and-sandbox` |
| `grok`           | `--always-approve --permission-mode auto`    |

沒有這個 flag 時，非互動執行常會卡在 CLI 的權限詢問。

## Template

內建 `system` 與 `auto-evolving`，兩者都是 inline content。設定另外支援 `file`
（讀外部檔案當 template source），只是預設沒有任何 file-backed template。
Template 是 Go `text/template`，可用的欄位只有 `.Prompt`、`.WorkDir`、`.Client`、
`.Driver`；`missingkey=error`，寫錯欄位會直接失敗。Skill prefix 由 template 自行分支
（`{{if eq .Driver "codex"}}$skill{{else}}/skill{{end}}`）。此外 Codex driver 會把
prompt 開頭的 `/skill` 自動改寫成 `$skill`。

## Wizard 與 PM2

`autop wizard` 依序問：CLI → template → bypass permission → model → effort →
prompt → cron（`N`=無、`r`=02:00–08:00 隨機、或完整 5-field cron）。它以向上尋找
`cmd/` 目錄判定 workspace root，把 task 寫進該 root 的 `ecosystem.config.js`
（atomic rename，保留既有 app），task 具 `// autop:begin|end` marker、
`namespace: "autop"`、`optional: true`、`autorestart: false`，名稱為
`Autop <client> <project-folder>`。寫完後印出 original autop command、mapped execute
command、ecosystem 路徑與完整 configuration。註冊後用 `pm2 start ecosystem.config.js`。

## Common Mistakes

| 症狀                                                            | 原因與修法                                                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `prompt is required when --template is not set`                 | 沒給 prompt 也沒給 `-t`                                                                                               |
| `prompt must come from positional arguments or stdin, not both` | 同時 pipe 與傳參數，擇一                                                                                              |
| `unknown client "x"`                                            | 拼錯或該 client 不在設定裡                                                                                            |
| `client "claudet" is disabled`                                  | profile `disabled: true`，改用其他 client                                                                             |
| `client "x" requires environment variable Y`                    | env-mode credential 沒 export source env                                                                              |
| CLI 卡在權限詢問                                                | 忘了 `--bypass-permission=true`（`auto_approve` 不會自動生效）                                                        |
| 新版本新增的 client 不在 `autop config` 輸出                    | 設定檔是舊的；跑 `autop config default --merge`。Runtime 仍可用 embedded default，所以 `-c grok` 能跑但 config 看不到 |

Exit code：child CLI 的 exit code 會原樣傳回；autop 自身錯誤回 `2`。

## 開發驗證

repo root 執行：`go test ./cmd/... -count=1`、`go vet ./...`、`go build .`、
安裝用 `go install .`。
