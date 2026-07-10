# Neural Core v1.0 Error Codes

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

## Error Envelope

`normalizeError(error, code, layer)` returns:

```json
{
  "code": "NC9001",
  "layer": "runtime",
  "message": "string",
  "recoverable": true,
  "timestamp": "ISO-8601"
}
```

## Frozen Error Codes

| Code | Name | Layer | Meaning | Expected Runtime Behavior |
|---|---|---|---|---|
| `NC1001` | Strategy Failure | Strategy | StrategyEngine failed or returned unusable output. | Degrade to default verified strategy. |
| `NC1002` | Decision Failure | Decision | DecisionEngine failed to record or return a decision. | Degrade to default verified decision. |
| `NC2001` | Planner Failure | Planner | Planner advisory layer failed. | Use fallback hints or safe plan path. |
| `NC3001` | Tool Failure | Tool | Tool approval, execution, timeout, throw, or reject failed. | Return standardized failed execution result. |
| `NC4001` | Verifier Failure | Verifier | Verifier threw or rejected result. | Return failed verification. |
| `NC5001` | Reflection Failure | Reflection | Reflection failed to analyze or save experience. | Write diagnostics; do not block final response. |
| `NC6001` | Memory Failure | Memory | Memory, context, decision, or experience data was missing/corrupt/unreadable. | Repair or recreate fallback schema. |
| `NC7001` | Event Failure | EventBus | Event governance, trace, or handler failed. | Record diagnostics; continue dispatch where safe. |
| `NC8001` | Idempotency Skip | Runtime | Duplicate event or task was skipped. | Treat as successful no-op. |
| `NC9001` | Unknown Runtime Failure | Runtime | Unclassified runtime failure. | Return recoverable failed runtime result. |

## Compatibility Rules

- Existing codes are frozen.
- Do not reuse an existing code for a different meaning.
- New v1.x codes may be appended only if backward compatible.
- Product Layer should surface codes but must not branch around Neural Core safety.

## Product Layer Handling

Product Layer should classify errors as:

- `recoverable:true`: may retry through Neural Core.
- `recoverable:false`: should stop and ask the user or report failure.
- `NC8001`: safe idempotent skip.
- `NC3001` or `NC4001`: execution or verification failure; do not report success.
