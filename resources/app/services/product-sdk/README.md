# Product SDK

Product SDK is the only supported bridge from Product Layer code into Neural Core v1.0.

Products call:

- `createTask()`
- `submitTask()`
- `queryTask()`
- `getTaskStatus()`
- `getTaskResult()`
- `getTaskHistory()`

Products must not call:

- AgentEventBus directly
- Memory directly
- ToolExecutionService directly
- ToolRegistry directly
- VerifierCenter directly

Runtime path:

```text
Product
↓
ProductSDK
↓
ProductEventAdapter
↓
Neural Core API
↓
AgentManager.dispatchTask
↓
TaskOrchestrator
```
