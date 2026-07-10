# Neural Core v1.0 Freeze Report

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

## Scope

Neural Core Foundation covers Phase 5.x through Phase 6.3.

Frozen areas:

- Runtime API
- AgentEventBus event model
- Error codes
- Memory schema
- Experience schema
- Agent Registry schema
- Runtime chain
- Governance boundaries
- Trace and diagnostics contracts

## Frozen Documents

- `runtime-api.md`
- `event-spec.md`
- `error-code.md`
- `memory-schema.md`
- `experience-schema.md`
- `agent-schema.md`
- `freeze-report.md`

## Runtime Freeze Decision

Neural Core is now stable infrastructure.

From this point forward:

- Do not add new Engine / Manager / Center / Agent to runtime.
- Do not modify the Neural Core main chain for Product Layer work.
- Do not bypass ToolSelector.
- Do not bypass ToolExecutionService.
- Do not bypass VerifierCenter.
- Do not bypass AgentEventBus.
- Do not write Memory/Experience/Agent Registry data directly from Product Layer.

## Stable Runtime Chain

```text
User
↓
SupervisorAgent
↓
StrategyEngine
↓
DecisionEngine
↓
ExperienceStore
↓
PlannerAgent
↓
AgentManager
↓
ExecutorAgent
↓
AgentManager.dispatchTask
↓
TaskOrchestrator
↓
TaskQueue
↓
ToolSelector
↓
ToolExecutionService
↓
VerifierCenter
↓
ReflectionEngine
↓
ExperienceStore Update
↓
Memory / Metrics / Trace
↓
ReplyBuilder
```

## Compatibility Policy

Neural Core v1.x changes must be:

- backward compatible
- additive only where possible
- covered by regression tests
- documented in these freeze specs

Breaking changes require a future major version, not Product Layer work.

## Product Layer Boundary

Product Layer examples:

- desktop assistant
- WeChat client
- Meituan operations
- office automation
- code development
- browser automation
- data analysis
- Excel workflows
- file processing

All Product Layer capabilities must call Neural Core APIs and publish standard events.

## Verification

Freeze documentation only. Runtime code is unchanged by this freeze.
