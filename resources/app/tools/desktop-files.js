function createRuntimeTool({ id, name, description, parameters, permission, run, evidenceType }) {
  return {
    id,
    name,
    description,
    parameters,
    permission,
    async execute(params, context) {
      const result = await run(params, context.runtime);
      return {
        success: true,
        result,
        error: null,
        evidence: [{ type: evidenceType, tool: id }]
      };
    }
  };
}

function createTools() {
  return [
    createRuntimeTool({
      id: "write_text_file",
      name: "写入文本文件",
      description: "在允许范围内写入 UTF-8 文本文件。",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      },
      permission: { level: "filesystem.write", scope: "app.desktop.saveLocation" },
      evidenceType: "file",
      run: (params, runtime) => runtime.executeWriteTextFile(params)
    }),
    createRuntimeTool({
      id: "write_xlsx",
      name: "生成 Excel 表格",
      description: "在允许范围内生成 xlsx 文件。",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
          sheets: { type: "array" },
          rows: { type: "array" }
        }
      },
      permission: { level: "filesystem.write", scope: "app.desktop.saveLocation" },
      evidenceType: "file",
      run: (params, runtime) => runtime.executeWriteXlsx(params)
    }),
    createRuntimeTool({
      id: "open_path",
      name: "打开文件或链接",
      description: "使用系统默认程序真实打开已生成的文件、文件夹或网页链接。",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
          url: { type: "string" },
          target: { type: "string" }
        }
      },
      permission: { level: "filesystem.read", scope: "app.desktop.saveLocation" },
      evidenceType: "open-path",
      run: (params, runtime) => runtime.executeOpenPath(params)
    }),
    createRuntimeTool({
      id: "modify_app_file",
      name: "修改白球应用文件",
      description: "只允许修改白球项目目录内文件，并在覆盖前备份旧文件。",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      },
      permission: { level: "filesystem.appWrite", scope: "appRoot" },
      evidenceType: "source-file",
      run: (params, runtime) => runtime.executeModifyAppFile(params)
    }),
    createRuntimeTool({
      id: "find_desktop_files",
      name: "查找桌面文件",
      description: "按关键词和扩展名查找桌面文件。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          keyword: { type: "string" },
          extensions: { type: "array" },
          limit: { type: "number" }
        }
      },
      permission: { level: "filesystem.read", scope: "desktop" },
      evidenceType: "file-list",
      run: (params, runtime) => runtime.executeFindDesktopFiles(params)
    }),
    createRuntimeTool({
      id: "recycle_desktop_files",
      name: "移动桌面文件到回收站",
      description: "按条件把桌面文件移动到 Windows 回收站。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          exactName: { type: "string" },
          exactNames: { type: "array" },
          extensions: { type: "array" },
          limit: { type: "number" }
        }
      },
      permission: { level: "filesystem.recycle", scope: "desktop" },
      evidenceType: "file-operation",
      run: (params, runtime) => runtime.executeRecycleDesktopFiles(params)
    }),
    createRuntimeTool({
      id: "organize_desktop_files",
      name: "整理桌面文件",
      description: "保留匹配关键词的文件，把其它匹配文件移动到桌面备份文件夹。",
      parameters: {
        type: "object",
        required: ["keepKeywords"],
        properties: {
          keepKeywords: { type: "array" },
          keep: { type: "array" },
          extensions: { type: "array" },
          targetFolder: { type: "string" }
        }
      },
      permission: { level: "filesystem.move", scope: "desktop" },
      evidenceType: "file-operation",
      run: (params, runtime) => runtime.executeOrganizeDesktopFiles(params)
    })
  ];
}

module.exports = { createTools };
