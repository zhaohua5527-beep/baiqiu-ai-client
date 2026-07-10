# Neural Core v1.0 Experience Schema

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

## Storage

Default file:

```text
D:\BaiQiuAI\data\memory\experience.json
```

Root schema:

```json
{
  "items": []
}
```

## Experience Item

```json
{
  "taskType": "string",
  "problem": "string",
  "cause": "string",
  "solution": "string",
  "intent": "string",
  "toolSequence": [],
  "strategy": null,
  "decision": null,
  "keywords": [],
  "toolsUsed": [],
  "relevance": 0,
  "usageCount": 0,
  "successRate": 1,
  "lastUsed": null,
  "confidence": 0.7,
  "createdAt": "ISO-8601"
}
```

## Field Rules

| Field | Type | Rule |
|---|---|---|
| `taskType` | string | Task category or inferred primary intent. |
| `problem` | string | Max 500 characters. |
| `cause` | string | Max 500 characters. |
| `solution` | string | Max 500 characters. |
| `intent` | string | User/runtime intent. Defaults to taskType. |
| `toolSequence` | string[] | Ordered tool sequence. |
| `strategy` | object|null | StrategyEngine result snapshot. |
| `decision` | object|null | DecisionEngine result snapshot. |
| `keywords` | string[] | Normalized keywords, max 30. |
| `toolsUsed` | string[] | Unique tool IDs observed in trace. |
| `relevance` | number | 0 to 1. Query-time relevance may overwrite result copy. |
| `usageCount` | number | Incremented when matched by query. |
| `successRate` | number | 0 to 1. |
| `lastUsed` | string|null | ISO timestamp or null. |
| `confidence` | number | 0 to 1. |
| `createdAt` | string | ISO timestamp. |

## Query Contract

`ExperienceStore.query()` accepts:

```json
{
  "taskType": "string",
  "intent": "string",
  "toolId": "string",
  "tools": [],
  "strategy": "string",
  "keywords": [],
  "problem": "string",
  "limit": 10
}
```

Returns an array of experience items sorted by:

```text
(relevance * 3) + confidence + successRate
```

## Learning Boundary

- Experience is advisory only.
- Experience may influence strategy ranking and planning hints.
- Experience must not grant permissions.
- Experience must not skip ToolSelector.
- Experience must not skip VerifierCenter.
- Failed or low-confidence experience may be stored, but must not be treated as proof of success.
