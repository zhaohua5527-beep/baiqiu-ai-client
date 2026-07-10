class DependencyBuilder {
  apply(steps = []) {
    const output = steps.map((step, index) => ({
      ...step,
      step: index + 1,
      dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : []
    }));

    const folder = output.find((step) => step.target === "folder" && step.action === "create");
    const files = output.filter((step) => step.target === "text_file" && step.action === "create");
    if (folder) {
      for (const file of files) this.addDependency(file, folder.id);
    }

    for (let index = 1; index < output.length; index += 1) {
      const current = output[index];
      if (current.action !== "open") continue;
      const previous = output[index - 1];
      if (previous) this.addDependency(current, previous.id);
      if (current.target === "folder" && folder) this.addDependency(current, folder.id);
    }

    return output;
  }

  addDependency(step, dependencyId) {
    if (!dependencyId) return;
    if (!step.dependsOn.includes(dependencyId)) step.dependsOn.push(dependencyId);
  }
}

module.exports = { DependencyBuilder };
