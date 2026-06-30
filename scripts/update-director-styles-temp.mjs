import fs from "node:fs";

const path = "config/director-system.json";
const config = JSON.parse(fs.readFileSync(path, "utf8"));

const updates = {
  "education-premium": {
    label: "高端教育品牌电影风",
    prompt_short: "像高端教育品牌宣传片的真实电影帧：可信、明亮、克制，不做招生海报。",
    image_prompt: "premium education brand cinematic still, real Chinese classroom and campus environment, calm confident teacher-parent-student interaction, warm daylight, refined art direction, natural commercial photography, shallow depth of field, clean foreground midground background, phone-screen readable subject, high-end education service mood",
    palette: "象牙白、深墨绿、暖木色、低饱和金色、自然肤色",
    texture: "真实摄影质感、干净玻璃、木质桌面、纸张细节、柔和自然光、轻微电影颗粒",
    composition: "主体在画面上方80%，老师/学生/家长关系清楚，前中后景有纵深，底部20%保持低信息密度字幕区",
    character: "同一套中国教育场景人物，表情自然可信，服装简洁高级，不摆拍、不夸张成功学",
    negative: "廉价招生海报、红黄大字报、PPT模板、夸张承诺、满屏文字、二维码、logo、水印、塑料棚拍、过度磨皮"
  },
  "parent-anxiety": {
    label: "家长焦虑电影纪实风",
    prompt_short: "真实家庭教育压力的电影纪实镜头，焦虑克制、有共情，不做恐吓营销。",
    image_prompt: "cinematic documentary still about Chinese family education pressure, low-saturation home interior, desk lamp warmth against blue-gray shadows, exam papers and phone notifications implied without readable text, parent waiting near school gate, restrained emotional close-ups, premium social documentary commercial look",
    palette: "灰蓝阴影、台灯暖黄、纸张白、木桌棕、低饱和肤色",
    texture: "真实家庭空间、书桌纸张、手机反光、校门口环境、自然颗粒和生活细节",
    composition: "近景情绪细节与环境建立交替，人物眼神和手部动作推动情绪，底部留干净字幕区",
    character: "中国家长和学生自然表情，焦虑但克制，真实生活状态，不哭喊、不戏剧化",
    negative: "恐吓式营销、血红警告、灾难化画面、廉价表情包、夸张哭脸、可读试卷文字、焦虑标题海报"
  },
  "knowledge-blogger": {
    label: "抖音知识博主高级口播风",
    prompt_short: "知识博主口播成片风格：人设清楚、信息有层次、画面高级但不堆字。",
    image_prompt: "premium short-form knowledge creator cinematic frame, Chinese educator or creator at a refined desk or studio corner, abstract evidence cards and data blocks without readable text, strong but clean vertical composition, practical social video lighting, clear face, hands and props, modern credible creator brand look",
    palette: "深炭黑、柔白、冷蓝、少量暖金或荧光青强调",
    texture: "现代桌面、柔和屏幕光、磨砂信息卡、干净数据几何、真实麦克风和笔记本材质",
    composition: "人物口播、道具细节、抽象信息层交替，主体大且清楚，底部20%为空白字幕安全区",
    character: "同一位中国知识博主/老师形象，专业、利落、有亲和力，服装与场景跨镜头一致",
    negative: "满屏文字、PPT课件截图、随机AI图库拼贴、重复人物、低级课程海报、二维码、水印、杂乱桌面"
  },
  "tech-data": {
    label: "高级科技数据可视化风",
    prompt_short: "科技数据风要像高端商业分析片，不是廉价蓝光特效。",
    image_prompt: "premium data-driven tech explainer cinematic frame, precise translucent data layers without readable text, glassmorphism panels, subtle holographic charts, dark clean space, controlled cyan and violet highlights, Chinese presenter silhouette or hand gesture only when useful, high-end consulting and technology mood",
    palette: "深墨黑、冷白、青蓝、电光紫、少量荧光绿",
    texture: "磨砂玻璃、微光线框、干净金属、浅景深屏幕反光、精密几何图层",
    composition: "核心数据隐喻居中清晰，图层有空间纵深，不糊成一团，底部留字幕安全区",
    character: "人物只作为专业讲解者或剪影出现，不抢数据主视觉，服装极简商务",
    negative: "赛博脏乱、满屏乱码、可读UI文字、廉价蓝光光污染、复杂不可读界面、黑到看不清、科幻跑题"
  },
  "pixar-3d-cartoon": {
    label: "原创高级3D动画电影风",
    prompt_short: "原创高级3D动画电影质感，温暖、细腻、有电影镜头层次，适合知识口播和情绪故事。",
    image_prompt: "original premium 3D animated film frame, stylized Chinese characters with consistent identity, expressive natural faces, refined skin and fabric materials, soft cinematic lighting, shallow depth of field, detailed classroom and family scenes, warm commercial short-film look, high-end art direction, not copying any existing IP",
    palette: "暖黄色、柔和蓝、奶油白、低饱和校园色、自然肤色",
    texture: "细腻3D材质、柔和皮肤、真实布料、干净环境、电影级软光和空间纵深",
    composition: "角色动作清晰，主体在上方80%，背景简洁但有生活细节，底部保留字幕安全区",
    character: "同一套原创中国动画人物设定，年龄、发型、服装和脸型跨镜头保持一致，不能像已有动画角色",
    negative: "直接模仿已有IP、塑料玩具感、过度夸张五官、廉价儿童动画、低质招生广告、随机换脸、随机换服装、可读文字"
  },
  "chinese-ink": {
    label: "高级新中式水墨电影风",
    prompt_short: "现代新中式水墨，不是古风贴纸；用留白和意象服务观点。",
    image_prompt: "modern Chinese ink wash editorial cinematic frame, elegant brush texture and restrained mineral color, symbolic school gate, exam paper shape, parent and child silhouette, poetic education metaphor, premium magazine illustration mood, clean negative space, no readable calligraphy text",
    palette: "墨黑、宣纸白、淡青灰、低饱和赭石、少量朱砂红",
    texture: "宣纸肌理、墨色晕染、干湿笔触、淡彩层次、细腻颗粒",
    composition: "大量留白但主体明确，意象服务口播观点，视觉重点在上方80%，底部字幕区干净",
    character: "人物以原创水墨轮廓或剪影呈现，动作明确、情绪克制，不做古装武侠设定",
    negative: "古装武侠跑题、廉价国潮贴纸、大红大金堆叠、书法大字、AI山水模板、主体太小、画面太空"
  },
  "sketch-line": {
    label: "高级手绘线稿解释风",
    prompt_short: "像高质量教育杂志手绘解释图，线条干净、逻辑清楚，不是儿童涂鸦。",
    image_prompt: "premium hand-drawn editorial explainer illustration, clean black ink lines with subtle warm paper texture, controlled gray shading, simple Chinese education characters and objects, visual metaphor for learning method, clear composition for short-video storyboard, no readable text",
    palette: "象牙纸白、墨黑、暖灰、少量浅蓝或琥珀强调",
    texture: "针管笔线条、细腻纸张颗粒、轻微铅笔阴影、干净扫描质感",
    composition: "用少量人物和物件讲清一个观点，线条有呼吸感，主体上移，底部留字幕区",
    character: "原创简洁人物轮廓，动作清楚，表情克制，跨镜头人物比例和服装保持一致",
    negative: "儿童涂鸦、乱线、漫画分镜格、可读文字、低清扫描、过度可爱贴纸、复杂背景"
  },
  "healing-illustration": {
    label: "高级治愈教育插画风",
    prompt_short: "温柔但不幼稚，适合缓解焦虑和讲成长感。",
    image_prompt: "premium healing editorial illustration for Chinese family education, warm morning sunlight, gentle campus and study desk moments, calm parent-child interaction, refined shapes, subtle texture, professional education brand warmth, cinematic depth, phone-screen readable subject",
    palette: "米白、鼠尾草绿、暖橙、天空蓝、低饱和粉、浅木色",
    texture: "柔和颗粒、轻微水彩纸感、干净光影、细腻边缘、温暖自然反光",
    composition: "舒展留白但主体明确，人物关系温柔，底部20%保留低细节字幕区",
    character: "家长和学生自然互动，温暖不煽情，人物设定跨镜头一致，不随机换脸",
    negative: "幼稚贴纸、糖果色过曝、网红滤镜、无关风景空镜、廉价儿童绘本、人物五官漂移"
  },
  "anime-commercial": {
    label: "高级商业动画番剧风",
    prompt_short: "清爽商业动画质感，动态强但不低俗、不套现成番剧脸。",
    image_prompt: "premium original anime commercial frame, clean cel shading, expressive Chinese student parent and teacher scenes, cinematic rim light, modern education setting, dynamic but readable camera angle, high-end social video animation look, original character design only",
    palette: "清透蓝、暖白、夕阳橙、深色校服、少量青绿色强调",
    texture: "干净线稿、赛璐璐上色、电影动画光影、细腻头发和布料层次",
    composition: "动态构图但不乱，人物表情和动作服务当前镜头，视觉重点上移，底部留字幕区",
    character: "原创中国学生/家长/老师动画人物，年龄和服装设定连续，不复制任何番剧角色",
    negative: "低俗萌化、擦边姿势、已有IP脸、杂乱漫画格、文字海报、过度夸张表情、AI手部错误"
  },
  "retro-futurism": {
    label: "高级复古未来教育风",
    prompt_short: "复古科幻只做隐喻和质感，不让画面跑题成科幻海报。",
    image_prompt: "premium retro-futuristic editorial commercial frame, 1980s science museum mood, geometric education planning panels, analog screens without readable text, warm neon accents, future map metaphor for learning path, cinematic short-video composition",
    palette: "深蓝黑、复古橙、薄荷绿、奶油白、少量玫瑰金",
    texture: "胶片颗粒、复古屏幕辉光、几何面板、磨砂塑料和金属、轻微霓虹边缘",
    composition: "几何秩序强，主体明确，科技隐喻服务文案，底部字幕区稳定干净",
    character: "人物可作为讲解者或剪影，造型简洁复古，不能喧宾夺主",
    negative: "脏乱赛博朋克、满屏英文乱码、廉价霓虹、跑题太科幻、宇宙飞船海报、主体不清"
  },
  "apple-keynote": {
    label: "极简发布会高级风",
    prompt_short: "极简发布会质感，画面像高端产品演示，不是空白PPT。",
    image_prompt: "minimal premium keynote cinematic visual for education service, refined black white gray space with one accent color, elegant studio lighting, precise object placement, product-launch clarity, abstract learning product metaphor, high-end negative space, no readable presentation text",
    palette: "黑、白、雾灰、单一品牌强调色、柔和高光",
    texture: "磨砂玻璃、干净金属、柔和渐变光、细腻阴影、无尘背景",
    composition: "大留白但有明确焦点，主体上方80%，空间秩序强，底部留字幕区",
    character: "人物少量出现时保持专业发布会姿态，服装极简，不抢主体",
    negative: "空白PPT、杂乱装饰、信息堆叠、廉价特效、可读大字、二维码、过暗无主体"
  },
  "documentary": {
    label: "真实纪录片电影风",
    prompt_short: "观察式真实镜头，适合案例、校区故事和信任感内容。",
    image_prompt: "observational documentary cinematic still, authentic Chinese education environment, natural window light, real parent student teacher details, restrained emotion, handheld documentary feeling, premium realism, human-centered short-video frame",
    palette: "自然肤色、环境灰、暖灯光、校区木色、低饱和绿",
    texture: "真实摄影、自然颗粒、现场光、生活细节、轻微镜头呼吸感",
    composition: "观察式跟拍、环境建立和人物细节穿插，主体清楚，底部字幕区不被复杂纹理占满",
    character: "真实普通人气质，不明星化、不摆拍，服装和环境符合中国教育场景",
    negative: "假大空宣传片、仪式感摆拍、过度美颜、虚假校区样板照、无主体空镜、脏乱低清"
  },
  "cinematic": {
    label: "高级电影感叙事风",
    prompt_short: "强光影、纵深、情绪动机明确，适合所有故事型口播。",
    image_prompt: "premium cinematic commercial frame, motivated lighting, strong depth with foreground midground background, emotional Chinese education or family scene, realistic lens perspective, controlled contrast, high-end short film still, clear subject for vertical video",
    palette: "深色基底、暖冷对比、自然肤色、少量高光强调",
    texture: "电影颗粒、浅景深、真实材质、空间光影、镜头眩光克制",
    composition: "每个镜头有明确动机，人物动作和视线推动情绪，视觉重点上移，底部留字幕区",
    character: "人物动作和眼神服务情绪，不浮夸，跨镜头服装和形象保持一致",
    negative: "空洞氛围、AI图库拼贴、重复镜头、过暗看不清、无意义背影、海报构图、可读文字"
  },
  "clean-commercial": {
    label: "干净高级商业广告风",
    prompt_short: "现代商业广告质感，卖点清楚、画面高级、不堆促销元素。",
    image_prompt: "clean premium modern commercial advertising still, productized education service metaphor, clear human subject or learning object, refined softbox lighting, uncluttered background, trustworthy brand asset, practical vertical short-video composition, no readable ad copy",
    palette: "白、浅灰、品牌蓝绿、暖木色、少量柔金",
    texture: "干净背景、柔和反光、真实纸张和设备、精致阴影、轻微景深",
    composition: "主体和卖点一眼可懂，背景轻，镜头可直接进入剪辑，底部字幕区稳定",
    character: "专业老师、家长或学生形象自然可信，服装干净，动作不过度销售化",
    negative: "过度包装、复杂背景、信息堆叠、廉价促销、大字报、二维码、水印、塑料棚拍"
  },
  "warm-campus": {
    label: "温暖校区生活电影风",
    prompt_short: "真实校区生活和师生互动，温暖、有成长感，不像招生库存图。",
    image_prompt: "warm campus life cinematic commercial still, real Chinese classroom and hallway, teacher-student interaction, golden hour sunlight, natural smiles, authentic growth story, premium education brand realism, clear vertical composition",
    palette: "暖阳黄、木色、校区绿、干净白、自然肤色",
    texture: "自然光、木桌、书本、校区墙面、真实布料、轻微电影颗粒",
    composition: "生活化镜头，人物关系和校区环境同等重要，主体清楚，底部字幕区干净",
    character: "师生互动自然，不摆拍、不假笑，同一项目中人物年龄和服装风格保持一致",
    negative: "过曝滤镜、千篇一律特写、空泛校园风景、廉价招生照、可读横幅、虚假笑脸、脏乱教室"
  }
};

config.visual_styles = config.visual_styles.map((style) => {
  const update = updates[style.id];
  if (!update) throw new Error(`missing style update: ${style.id}`);
  return { ...style, ...update };
});

fs.writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
