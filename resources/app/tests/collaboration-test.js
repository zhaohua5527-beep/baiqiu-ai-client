const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentMessageBus } = require("../services/collaboration/agent-message-bus");
const { TeamPlanner } = require("../services/collaboration/team-planner");
const { AgentCoordinator } = require("../services/collaboration/agent-coordinator");
const { AgentCollaborationCenter } = require("../services/collaboration/agent-collaboration-center");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "collaboration-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function samplePlan() {
  return {
    goal: "创建文件夹，里面三个文件，然后打开",
    steps: [
      { id: "step-1.create.folder", toolId: "create_folder", action: "create", target: "folder", dependsOn: [] },
      { id: "step-2.create.text_file", toolId: "file_creator", action: "create", target: "text_file", dependsOn: ["step-1.create.folder"] },
      { id: "step-3.create.text_file", toolId: "file_creator", action: "create", target: "text_file", dependsOn: ["step-1.create.folder"] },
      { id: "step-4.create.text_file", toolId: "file_creator", action: "create", target: "text_file", dependsOn: ["step-1.create.folder"] },
      { id: "step-5.open.folder", toolId: "browser_open", action: "open", target: "folder", dependsOn: ["step-4.create.text_file", "step-1.create.folder"] }
    ]
  };
}

function run() {
  const dir = root("collaboration");
  const bus = new AgentMessageBus({ rootDir: dir });
  const message = bus.publish({
    from: "SupervisorAgent",
    to: "PlannerAgent",
    type: "goal",
    payload: { goal: "test" },
    sessionId: "collab-test",
    traceId: "trace-1"
  });
  assert(message.id, "message should have id");
  assert.strictEqual(bus.list({ to: "PlannerAgent" }).length, 1, "message bus should filter by receiver");

  const teamPlanner = new TeamPlanner();
  const teamPlan = teamPlanner.createTeamPlan(samplePlan());
  assert.strictEqual(teamPlan.status, "planned");
  assert(teamPlan.agents.includes("ExecutorAgent"), "tool tasks should be assigned to ExecutorAgent");
  assert.strictEqual(teamPlan.assignments.length, 5, "all steps should become assignments");
  const grouped = teamPlanner.splitByAgent(teamPlan);
  assert.strictEqual(grouped.ExecutorAgent.length, 5, "execution tasks should be grouped for ExecutorAgent");

  const coordinator = new AgentCoordinator({ messageBus: bus, teamPlanner });
  const coordination = coordinator.coordinate({
    planObject: samplePlan(),
    sessionId: "collab-test",
    traceId: "trace-2"
  });
  assert.strictEqual(coordination.messages.length, 1, "coordinator should publish one grouped assignment message");
  assert.strictEqual(coordination.messages[0].to, "ExecutorAgent");

  const summary = coordinator.summarize([
    { taskId: "step-1", status: "success" },
    { taskId: "step-2", success: true }
  ]);
  assert.strictEqual(summary.success, true);
  assert.strictEqual(summary.successCount, 2);

  const failedSummary = coordinator.summarize([
    { taskId: "step-1", status: "success" },
    { taskId: "step-2", status: "failed" }
  ]);
  assert.strictEqual(failedSummary.success, false);
  assert.strictEqual(failedSummary.failedCount, 1);

  const center = new AgentCollaborationCenter({ rootDir: dir });
  const session = center.planCollaboration({
    planObject: samplePlan(),
    sessionId: "center-session",
    traceId: "trace-3"
  });
  assert.strictEqual(session.session.assignmentCount, 5, "center should store collaboration session");
  assert(fs.existsSync(path.join(dir, "messages.json")));
  assert(fs.existsSync(path.join(dir, "collaboration-sessions.json")));

  const serialized = JSON.stringify(bus.load());
  assert(!serialized.includes("ToolExecutionService"), "collaboration layer should not call or bypass ToolExecutionService");
  assert(!serialized.includes("VerifierCenter"), "collaboration layer should not bypass VerifierCenter");

  return {
    ok: true,
    cases: [
      "message_bus_publish_filter",
      "team_planner_split_tasks",
      "coordinator_assignment_messages",
      "result_summary",
      "no_tool_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
