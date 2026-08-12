# accli — 完整指令參考 (Full Command Reference)

所有指令都接受 `--json`（建議一律加上）與 `--help`。

## DateTime Formats

- Timed events: `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`
- All-day events: `YYYY-MM-DD`

## List Calendars

```
accli calendars [--json]
```

Lists all available calendars with names and persistent IDs. Run this first to
discover available calendars and their IDs.

## List Events

```
accli events <calendarName> [options]
```

| Option | 說明 |
| --- | --- |
| `--calendar-id <id>` | Persistent calendar ID (recommended over name) |
| `--from <datetime>` | Start of range (default: now) |
| `--to <datetime>` | End of range (default: from + 7 days) |
| `--max <n>` | Maximum events to return (default: 50) |
| `--query <q>` | Case-insensitive filter on summary/location/description |

```bash
# Events from Work calendar for this week
accli events Work --json

# Events in January
accli events Work --from 2025-01-01 --to 2025-01-31 --json

# Search for specific events
accli events Work --query "standup" --max 10 --json
```

## Get Single Event

```
accli event <calendarName> <eventId> [--json]
```

Retrieves details for a specific event by its ID.

## Create Event

```
accli create <calendarName> --summary <s> --start <datetime> --end <datetime> [options]
```

Required: `--summary`, `--start`, `--end`.
Optional: `--location <l>`, `--description <d>`, `--all-day`.

```bash
# Create a timed meeting
accli create Work --summary "Team Standup" --start 2025-01-15T09:00 --end 2025-01-15T09:30 --json

# Create an all-day event
accli create Personal --summary "Vacation" --start 2025-07-01 --end 2025-07-05 --all-day --json

# Create with location and description
accli create Work --summary "Client Meeting" --start 2025-01-15T14:00 --end 2025-01-15T15:00 \
  --location "Conference Room A" --description "Q1 planning discussion" --json
```

## Update Event

```
accli update <calendarName> <eventId> [options]
```

All options optional — only provide what to change: `--summary`, `--start`,
`--end`, `--location`, `--description`, `--all-day`, `--no-all-day`.

```bash
accli update Work event-id-123 --summary "Updated Meeting Title" \
  --start 2025-01-15T15:00 --end 2025-01-15T16:00 --json
```

## Delete Event

```
accli delete <calendarName> <eventId> [--json]
```

Permanently deletes an event. Confirm with user before executing.

## Check Free/Busy

```
accli freebusy --calendar <name> --from <datetime> --to <datetime> [options]
```

| Option | 說明 |
| --- | --- |
| `--calendar <name>` | Calendar name (can repeat for multiple calendars) |
| `--calendar-id <id>` | Persistent calendar ID (can repeat) |
| `--from <datetime>` | Start of range (required) |
| `--to <datetime>` | End of range (required) |

Shows busy time slots, excluding cancelled, declined, and transparent events.

```bash
# Check availability across calendars
accli freebusy --calendar Work --calendar Personal --from 2025-01-15 --to 2025-01-16 --json

# Check specific hours
accli freebusy --calendar Work --from 2025-01-15T09:00 --to 2025-01-15T18:00 --json
```

## Configuration

```bash
accli config set-default                  # interactive
accli config set-default --calendar Work  # by name
accli config show                         # show current config
accli config clear                        # clear default
```

When a default calendar is set, commands automatically use it if no calendar is
specified.

## Common Patterns

Find a free slot and schedule:

```bash
# 1. Check availability
accli freebusy --calendar Work --from 2025-01-15T09:00 --to 2025-01-15T18:00 --json

# 2. Create event in available slot
accli create Work --summary "Meeting" --start 2025-01-15T14:00 --end 2025-01-15T15:00 --json
```

View today's schedule:

```bash
accli events Work --from $(date +%Y-%m-%d) --to $(date -v+1d +%Y-%m-%d) --json
```
