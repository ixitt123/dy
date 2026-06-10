// DirectorScript 标准化输出
export class DirectorScript {
  constructor({ id, rewriteResultId, title, totalDuration, visualStyle, shots = [] }) {
    this.id = id;
    this.rewriteResultId = rewriteResultId;
    this.title = title;
    this.totalDuration = totalDuration;
    this.visualStyle = visualStyle;
    this.shots = shots;
  }

  static create({ title, rewriteResultId = "", visualStyle = "knowledge-blogger" }) {
    return new DirectorScript({
      id: `dir_${Date.now()}`,
      rewriteResultId,
      title,
      totalDuration: 0,
      visualStyle,
      shots: [],
    });
  }

  addShot(shot) {
    this.shots.push(shot);
    this.totalDuration = this.shots.reduce((s, sh) => s + (sh.duration || 3), 0);
  }
}

export class DirectorShot {
  constructor(data) {
    Object.assign(this, data);
    this.duration = data.duration || 3;
  }

  static create({ shotNo, narration = "", subtitle = "", camera = {}, scene = {}, character = {} }) {
    return new DirectorShot({
      shotNo,
      duration: 3,
      text: { narration, subtitle },
      camera: {
        shotSize: camera.shotSize || "中景",
        angle: camera.angle || "平视",
        movement: camera.movement || "固定",
        composition: camera.composition || "中心构图",
      },
      scene: {
        location: scene.location || "",
        lighting: scene.lighting || "自然光",
        atmosphere: scene.atmosphere || "",
        props: scene.props || [],
      },
      character: {
        action: character.action || "",
        expression: character.expression || "",
        wardrobe: character.wardrobe || "",
      },
      audio: { bgm: "", sfx: [], voiceEmotion: "自然" },
      assetPrompt: {
        imagePrompt: narration,
        videoPrompt: "",
      },
    });
  }
}

export function parseDirectorScript(json) {
  const script = DirectorScript.create({ title: json.title || "未命名" });
  const shots = json.shots || json.storyboard || [];
  for (let i = 0; i < shots.length; i++) {
    script.addShot(DirectorShot.create({ shotNo: i + 1, narration: shots[i].voice_text || shots[i].narration || "", subtitle: shots[i].subtitle || "", camera: shots[i].camera || {}, scene: shots[i].scene || {} }));
  }
  return script;
}
