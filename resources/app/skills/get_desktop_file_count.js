const fs = require('node:fs');
const path = require('node:path');

const MANIFEST = {
  name: 'get_desktop_file_count',
  description: '获取桌面文件数量',
  parameters: {}
};

async function execute(params) {
  try {
    const desktopPath = path.join(require('node:os').homedir(), 'Desktop');
    const files = fs.readdirSync(desktopPath).filter(f => {
      const fullPath = path.join(desktopPath, f);
      return fs.statSync(fullPath).isFile();
    });
    return {
      success: true,
      result: `桌面共有 ${files.length} 个文件`,
      evidence: { count: files.length, files: files }
    };
  } catch (err) {
    return {
      success: false,
      result: '获取桌面文件数量失败',
      evidence: { error: err.message }
    };
  }
}

module.exports = { MANIFEST, execute };
