# Neural Core v1.0 Runtime API

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

This document freezes the public runtime API for the Neural Core foundation. Product Layer modules must call these APIs instead of modifying the Neural Core runtime chain.

## Compatibility Rules

- Public exports listed here are stable for v1.x.
- Future changes must be backward compatible.
- Runtime callers must not bypass ToolSelector, ToolExecutionService, VerifierCenter, AgentEventBus, or AgentManager dispatch.
- Product Layer code may compose these APIs, but must not mutate Neural Core internals directly.

## Runtime Entry Points

### AgentEventBus

Module: `services/neural-core/agent-event-bus.js`

Exports:

- `AgentEventBus`
- `getDefaultAgentEventBus()`
- `AGENT_EVENTS`
- `ERROR_CODES`
- `normalizeError(error, code, layer)`
- `recordRuntimeMetric(name, options)`
- `writeHealthReport()`
- `writeDiagnostics(extra)`
- `RUNTIME_METRICS_FILE`
- `HEALTH_REPORT_FILE`
- `DIAGNOSTICS_FILE`

Constructor:

```js
new AgentEventBus({ trace, governance, reflectionEngine })
```

Public methods:

- `subscribe(type, handler)` returns unsubscribe function.
- `publish(type, payload)` creates, governs, traces, deduplicates, and dispatches an event.
- `dispatch(event)` dispatches an already-created event to listeners.
- `getTrace(traceId)` returns the trace snapshot.
- `eventKey(event)` returns the idempotency key.
- `rememberEvent(key)` records an event key in the bounded consumed-event set.

### AgentManager

Module: `services/neural-core/agent-manager.js`

Exports:

- `AgentManager`
- `roleNeedsFor(input)`

Constructor:

```js
new AgentManager({ registry, protocol, eventBus })
```

Public methods:

- `createTeam({ taskType, goal, strategy, sessionId, traceId })`
- `updateAgentResult(agentId, result)`
- `dispatchTask({ taskOrchestrator, sessionId, message, planObject, contextPatch, signal })`

Frozen responsibility:

- AgentManager is the Neural Core task dispatcher.
- Product Layer must route execution through AgentManager when entering the runtime.

### AgentRegistry

Module: `services/neural-core/agent-registry.js`

Exports:

- `AgentRegistry`
- `DEFAULT_REGISTRY_FILE`

Public methods:

- `registerAgent(agent)`
- `queryAgent(query)`
- `matchAgents({ role, skills, capabilities, taskType, limit })`
- `updateSuccessRate(agentId, result)`
- `load()`
- `write(data)`

### StrategyEngine

Module: `services/neural-core/strategy-engine.js`

Exports:

- `StrategyEngine`

Public methods:

- `chooseStrategy({ taskType, experiences, riskLevel, goal })`
- `rankExperiences({ taskType, experiences, goal })`
- `relevance(item, taskType, goal)`
- `confidence({ related, successRate, riskLevel })`
- `modeFor({ successRate, riskLevel, related })`
- `reasonFor({ related, successRate, riskLevel, tools })`
- `strategyId({ taskType, tools, riskLevel })`
- `teamNeedsFor({ taskType, goal, riskLevel })`

Frozen behavior:

- Strategy may recommend and rank.
- Strategy must not execute tools, change permissions, or bypass verification.

### DecisionEngine

Module: `services/neural-core/decision-engine.js`

Exports:

- `DecisionEngine`
- `DEFAULT_DECISION_FILE`

Public methods:

- `decide({ taskType, strategy, experiences, riskLevel, goal })`
- `recent(limit)`
- `load()`
- `write(data)`

Frozen behavior:

- Decision records selected strategy, reason, used experience, risk, confidence, and goal.
- Decision failure must degrade to `NC1002` default decision.

### ExperienceStore

Module: `services/neural-core/experience-store.js`

Exports:

- `ExperienceStore`
- `DEFAULT_EXPERIENCE_MEMORY_FILE`

Public methods:

- `saveExperience(input)`
- `query({ taskType, intent, toolId, tools, strategy, keywords, problem, limit })`
- `relevance(item, query)`
- `markUsed(matches)`
- `load()`
- `write(data)`

Frozen behavior:

- Experience is advisory.
- Experience must not bypass ToolSelector, permissions, or VerifierCenter.

### ReflectionEngine

Module: `services/neural-core/reflection-engine.js`

Exports:

- `ReflectionEngine`

Public methods:

- `attach(eventBus)`
- `onVerification(event)`
- `reflect(event)`
- `createExperience({ event, trace })`
- `inferTaskType({ toolsUsed, plan })`
- `keywordsFor(input)`
- `toolsUsed(trace, data)`
- `failureCause(problem, trace)`
- `solutionFor(problem, trace)`
- `confidence({ failed, trace, toolsUsed })`

Frozen behavior:

- Reflection listens to runtime events and writes Experience.
- Reflection is idempotent per `traceId:eventType`.
- Reflection must not change permissions or execute tools.

### AgentTrace

Module: `services/neural-core/agent-trace.js`

Exports:

- `AgentTrace`

Public methods:

- `record(event)`
- `applyEvent(trace, event)`
- `snapshot(traceId)`
- `recent(limit)`
- `safeClone(value)`

### NeuralGovernance

Module: `services/neural-core/governance.js`

Exports:

- `NeuralGovernance`

Public methods:

- `check(event)`

Frozen behavior:

- Enforces max event loop limit.
- Requires confirmation for high-risk tool execution events.
- Blocks fatal/panic/uncaught abnormal-stop events.

### TeamPlanner

Module: `services/neural-core/team-planner.js`

Exports:

- `TeamPlanner`

Public methods:

- `buildTeamPlan({ team, goal, strategy, steps, sessionId, traceId })`
- `deliverableFor(role)`
- `relatedSteps(role, steps)`

### CollaborationProtocol

Module: `services/neural-core/collaboration-protocol.js`

Exports:

- `CollaborationProtocol`

Public methods:

- `createTransfer({ fromAgent, toAgent, taskId, deliverable, input, output, status })`
- `completeTransfer(taskId, output)`
- `validateTransfer(transfer)`
- `listTransfers()`

## Product Layer Invocation Pattern

Product Layer code should follow this pattern:

```js
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./services/neural-core/agent-event-bus");
const { AgentManager } = require("./services/neural-core/agent-manager");

const eventBus = getDefaultAgentEventBus();
eventBus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId, traceId, intent, userIntent });

const agentManager = new AgentManager({ eventBus });
await agentManager.dispatchTask({
  taskOrchestrator,
  sessionId,
  message,
  planObject,
  contextPatch: { traceId },
  signal
});
```

## Frozen Runtime Chain

```text
User
↓
SupervisorAgent
↓
Neural Core StrategyEngine
↓
Neural Core DecisionEngine
↓
ExperienceStore
↓
PlannerAgent
↓
Neural Core AgentManager
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
Neural Core ReflectionEngine
↓
ExperienceStore Update
↓
Memory / Metrics / Trace
↓
ReplyBuilder
```
