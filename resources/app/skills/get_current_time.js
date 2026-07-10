const MANIFEST = {
  name: "get_current_time",
  description: "获取当前系统时间",
  parameters: {
    type: "object",
    properties: {},
    required: []
  }
};

async function execute(_params, _context) {
  const now = new Date();
  return {
    success: true,
    result: `当前时间：${now.toLocaleString("zh-CN")}`,
    evidence: { executedAt: now.toISOString() }
  };
}

module.exports = { MANIFEST, execute };
