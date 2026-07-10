function average(values = []) {
  const nums = values.map((value) => Number(value) || 0);
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

class BenchmarkEngine {
  summarize(results = []) {
    const total = results.length;
    const passed = results.filter((item) => item.success).length;
    const toolUsage = {};
    const failureType = {};
    let recoveryCount = 0;
    for (const result of results) {
      for (const toolId of result.selectedTools || []) toolUsage[toolId] = (toolUsage[toolId] || 0) + 1;
      if (!result.success) {
        const type = result.failureType || "unknown";
        failureType[type] = (failureType[type] || 0) + 1;
      }
      recoveryCount += Number(result.recoveryCount || 0);
    }
    return {
      total,
      passed,
      failed: total - passed,
      successRate: total ? passed / total : 0,
      avgDuration: average(results.map((item) => item.duration || 0)),
      failureType,
      toolUsage,
      recoveryCount
    };
  }
}

module.exports = { BenchmarkEngine };
