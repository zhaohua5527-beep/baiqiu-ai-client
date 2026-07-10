const THEMES = {
  xeno: { name: "像素黑", textColor: "#f2ff64", accentColor: "#f7ff2f", backgroundColor: "#020402", panelColor: "#071008", fontSize: 16 },
  daylight: { name: "像素白", textColor: "#050505", accentColor: "#111111", backgroundColor: "#f4f1e7", panelColor: "#ffffff", fontSize: 16 },
  cyberpunk: { name: "赛博朋克", textColor: "#e8fbff", accentColor: "#00e5ff", backgroundColor: "#07020d", panelColor: "#12091f", fontSize: 16 },
  military: { name: "军工绿", textColor: "#d9ffd6", accentColor: "#7cff4f", backgroundColor: "#071007", panelColor: "#101c0e", fontSize: 16 },
  warmEye: { name: "暖色护眼", textColor: "#33291f", accentColor: "#7d5a24", backgroundColor: "#f3ead8", panelColor: "#fff8ea", fontSize: 16 }
};

class ThemeManager {
  list() { return Object.entries(THEMES).map(([id, theme]) => ({ id, ...theme })); }
  get(id) { return THEMES[id] || THEMES.xeno; }
}

module.exports = { ThemeManager, THEMES };
