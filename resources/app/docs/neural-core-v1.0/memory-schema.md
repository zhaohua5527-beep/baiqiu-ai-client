# Neural Core v1.0 Memory Schema

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

## Storage Roots

Primary memory root:

```text
D:\BaiQiuAI\data\memory
```

Context memory root:

```text
D:\BaiQiuAI\data\memory\context
```

## MemoryCenter Files

### user.json

```json
{
  "name": "",
  "nickname": "",
  "preferences": [],
  "legacy": {},
  "updatedAt": null
}
```

### context.json

```json
{
  "project": {},
  "skill": {},
  "temporary": {},
  "updatedAt": null
}
```

### summary.json

```json
{
  "summaries": [],
  "updatedAt": null
}
```

### history.json

```json
{
  "items": [],
  "updatedAt": null
}
```

History item:

```json
{
  "id": "uuid",
  "at": "ISO-8601",
  "type": "string"
}
```

### experience.json

See `experience-schema.md`.

## ContextManager Files

### active.json

```json
{
  "version": 1,
  "messages": [],
  "currentTask": null,
  "currentStep": "",
  "sessions": {},
  "updatedAt": null
}
```

Message item:

```json
{
  "id": "uuid",
  "sessionId": "string",
  "role": "user|assistant|system",
  "text": "string",
  "createdAt": 0,
  "at": "ISO-8601"
}
```

Session task state:

```json
{
  "sessionId": "string",
  "status": "string",
  "intent": "string",
  "tool": "string",
  "plan": [],
  "updatedAt": "ISO-8601"
}
```

### summary.json

```json
{
  "version": 1,
  "summaries": [],
  "project": {},
  "preferences": [],
  "importantDecisions": [],
  "openTasks": [],
  "updatedAt": null
}
```

### archive.json

```json
{
  "version": 1,
  "items": [],
  "updatedAt": null
}
```

Archive item:

```json
{
  "id": "string",
  "at": "ISO-8601",
  "reason": "string",
  "messageCount": 0,
  "summary": "string"
}
```

## Integrity Rules

- Missing files are automatically created with default schema.
- Corrupt JSON is backed up as `.corrupt-<timestamp>` and recreated.
- Memory writes should use atomic write where available.
- Product Layer must not write memory files directly; use MemoryCenter, ContextManager, ExperienceStore, or Neural Core events.
