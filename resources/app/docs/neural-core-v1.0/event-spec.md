# Neural Core v1.0 Event Spec

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

## Event Envelope

All standard events are created by `createAgentEvent(type, payload)`.

```json
{
  "type": "EVENT_NAME",
  "sessionId": "string",
  "traceId": "string",
  "taskId": "string",
  "payload": {},
  "timestamp": 0
}
```

Resolution rules:

- `sessionId`: `payload.sessionId || payload.context.sessionId || payload.traceId || "global"`
- `traceId`: `payload.traceId || payload.context.traceId || ""`
- `taskId`: `payload.taskId || payload.taskContext.taskId || ""`

## Standard Events

| Event | State | Purpose |
|---|---|---|
| `INTENT_DETECTED` | `UNDERSTANDING` | User intent has been detected or classified. |
| `PLAN_CREATED` | `PLANNING` | Planner has created or updated a plan. |
| `TOOL_SELECTED` | `SELECTING_TOOL` | ToolSelector has selected or prepared a tool. |
| `TOOL_EXECUTING` | `EXECUTING` | Runtime is starting tool execution. |
| `TOOL_RESULT` | `EXECUTING` | Tool execution produced a result. |
| `VERIFICATION_DONE` | `VERIFYING` | VerifierCenter completed verification. |
| `MEMORY_UPDATED` | `LEARNING` | Memory or experience has been updated. |
| `TASK_COMPLETED` | `COMPLETED` | Task completed successfully. |
| `TASK_FAILED` | `COMPLETED` | Task failed or was blocked. |
| `AGENT_REGISTERED` | none | AgentRegistry registered or updated an Agent profile. |
| `TEAM_CREATED` | none | AgentManager created a team. |
| `TASK_ASSIGNED` | none | AgentManager assigned work to an Agent role. |
| `TASK_TRANSFERRED` | none | CollaborationProtocol created a role handoff. |
| `AGENT_COMPLETED` | none | Agent completed assigned work or result was recorded. |
| `TEAM_COMPLETED` | none | TeamPlanner completed a team task graph. |

## Event Idempotency

AgentEventBus deduplicates events by:

```text
payload.eventId
or
sessionId | traceId | type | stableTask | stableStatus
```

`stableTask` is resolved from:

- `event.taskId`
- `payload.taskId`
- `payload.assignment.assignmentId`
- `payload.team.teamId`
- `payload.plan.id`

`stableStatus` is resolved from:

- `payload.status`
- `payload.toolId`
- `payload.intent`
- `payload.currentAgent`

Duplicate events return:

```json
{
  "duplicate": true,
  "blocked": false,
  "governance": {
    "allowed": true,
    "status": "duplicate_ignored",
    "reason": "NC8001"
  }
}
```

## Governance Rules

AgentEventBus calls `NeuralGovernance.check(event)` before dispatch.

Frozen governance statuses:

- `allowed`
- `blocked`
- `confirm_required`
- `abnormal_stop`
- `governance_error`
- `duplicate_ignored`

Rules:

- More than `maxLoops` events for the same `sessionId:type` are blocked.
- `TOOL_EXECUTING` with high risk requires `confirmed:true`.
- Fatal/panic/uncaught errors cause abnormal stop.

## Trace Mapping

AgentTrace consumes events and updates:

- `userIntent`
- `plan`
- `toolSelections`
- `executions`
- `verifications`
- `errors`
- `repairs`
- `agents`
- `teams`
- `assignments`
- `transfers`
- `events`

## Event Compatibility Rules

- New Product Layer events must not replace standard events.
- Existing event names and envelope fields are frozen.
- Additional payload fields are allowed only when backward compatible.
- Product Layer must publish standard events when entering or observing Neural Core runtime.
