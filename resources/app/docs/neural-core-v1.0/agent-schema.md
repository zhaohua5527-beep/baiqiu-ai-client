# Neural Core v1.0 Agent Registry Schema

Status: Frozen
Version: Neural Core v1.0
Freeze Date: 2026-07-10

## Storage

Default file:

```text
D:\BaiQiuAI\data\neural-core\agent-registry.json
```

Root schema:

```json
{
  "agents": []
}
```

## Agent Item

```json
{
  "agentId": "string",
  "name": "string",
  "role": "string",
  "skills": [],
  "capabilities": [],
  "successRate": 1,
  "taskHistory": [],
  "availability": "available",
  "confidence": 0.8,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

## Default Agents

### SupervisorAgent

```json
{
  "agentId": "supervisor-agent",
  "name": "SupervisorAgent",
  "role": "supervisor",
  "skills": ["intent", "policy", "routing"],
  "capabilities": ["understand_goal", "classify_task", "decide_need_plan"],
  "successRate": 1,
  "availability": "available",
  "confidence": 0.95
}
```

### PlannerAgent

```json
{
  "agentId": "planner-agent",
  "name": "PlannerAgent",
  "role": "planner",
  "skills": ["planning", "decomposition", "dependency"],
  "capabilities": ["create_plan", "build_task_graph", "risk_aware_planning"],
  "successRate": 1,
  "availability": "available",
  "confidence": 0.92
}
```

### ExecutorAgent

```json
{
  "agentId": "executor-agent",
  "name": "ExecutorAgent",
  "role": "executor",
  "skills": ["execution", "tool_selection", "recovery"],
  "capabilities": ["execute_tool_task", "coordinate_task_queue", "handle_recovery"],
  "successRate": 1,
  "availability": "available",
  "confidence": 0.9
}
```

### VerifierAgent

```json
{
  "agentId": "verifier-agent",
  "name": "VerifierAgent",
  "role": "verifier",
  "skills": ["verification", "quality_check"],
  "capabilities": ["verify_result", "detect_failure", "recommend_retry"],
  "successRate": 1,
  "availability": "available",
  "confidence": 0.9
}
```

## Task History Item

```json
{
  "taskType": "string",
  "success": true,
  "duration": 0,
  "timestamp": "ISO-8601"
}
```

## Matching Rules

AgentRegistry matches agents by:

- role exact match
- skill overlap
- capability overlap
- taskType text match
- successRate
- confidence

`availability:"unavailable"` agents are excluded from matching.

## Compatibility Rules

- Existing fields are frozen.
- New fields must be optional.
- Product Layer may register product-specific agents, but they remain advisory role records and must not execute tools outside Neural Core.
