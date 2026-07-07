# Ian 小黑插图 Skill 说明视频导演稿

## 基础设定

- 视频类型：中文说明视频 / faceless explainer。
- 说明对象：`ian-xiaohei-illustrations` Codex skill。
- 目标观众：经常写中文文章、做 AI 工作流文档、需要正文配图但不想做成 PPT 的创作者。
- 画幅与时长：16:9，约 34 秒。
- 传播目标：让观众理解这个 skill 不是“随机生图”，而是先找认知锚点，再用小黑和怪诞手绘隐喻生成正文配图。
- 主视觉风格：纯白背景、黑色手绘线稿、小黑作为核心动作主体、少量红橙蓝中文手写批注。

## 传播结构

- Hook：配图真正难的不是画面，而是判断哪个认知点值得被画出来。
- Pain：普通 AI 配图容易变成 PPT 流程图、装饰图、密集说明书。
- Conflict：文章需要的是一个可被一眼看懂的认知锚点，不是平均分配的图片。
- Proof：skill 的规则要求先消化正文、选 1 个核心结构、让小黑参与核心动作，再做 QA。
- Solution：输入正文后，系统提炼锚点、发明怪诞但成立的隐喻、输出 16:9 正文配图策略或图像提示。
- CTA：下一次不要先问“配几张图”，先问“哪个点需要被看见”。

## Story Arc

1. 混沌：文章里到处都是可画的句子，但真正值得画的只有认知转折。
2. 误区：如果只把内容节点排整齐，画面会变成 PPT。
3. 判断：Director 先识别传播结构和画面目的。
4. 生成：小黑把正文塞进低科技机器，只输出一个怪诞隐喻。
5. 复核：用 QA 砍掉多余解释，保留清爽白底、短标注和核心动作。
6. 记忆点：图不是装饰，是让一个观点被看见。

## Shot List

| 镜头 | 时间 | 叙事目的 | 情绪 | 旁白 | 字幕 | 镜头与构图 |
|---|---:|---|---|---|---|---|
| 1 | 0.0-5.2s | 前 3 秒建立钩子：难点是找锚点，不是找图 | 清醒、好奇 | 一篇中文文章，真正难的不是配图，是找出哪个认知点值得被画出来。 | 不是找图，是找认知锚点 | 左侧大字，右侧白纸雾团。小黑拉出一根黑线，墨粉从问号后方飘出并落在“锚点”旁。 |
| 2 | 4.7-10.4s | 展示错误路径：把正文画成 PPT | 厌倦、警觉 | 只把段落排成节点，结果很快就变成流程图、课件和装饰图。 | 坏配图长得像 PPT | 左侧警示文字，右侧整齐网格被小黑扛来的标签压弯，红色批注敲下“退回”。 |
| 3 | 9.9-16.0s | 引出导演判断：先分析传播结构和镜头目的 | 专业、镇定 | 所以它先做导演判断：hook、pain、proof、solution，每一张图都要服务一个目的。 | Director 先判断目的 | 右侧是认知锚点秤，小黑调节杠杆，蓝色系统纸条沿弧线贴到四个结构词上。 |
| 4 | 15.5-22.0s | 说明 skill 工作流：正文到怪诞隐喻 | 顺畅、明确 | 然后才进入小黑风格：正文进来，锚点留下，隐喻成形，最后变成一张清爽的 16:9 正文配图。 | 正文 -> 锚点 -> 隐喻 -> 配图 | 中央低科技机器，小黑摇曲柄。橙色墨流沿管道移动，终点吐出 16:9 白底图。 |
| 5 | 21.5-28.2s | 强化 QA：清爽、短标注、小黑必须干活 | 克制、挑剔 | 复核时只看三件事：小黑是不是在干活，画面是不是够空，中文是不是够短。 | QA：少、准、怪 | 小黑拿橡皮擦掉过密节点，红色碎纸向右散开，剩下三个短问题。 |
| 6 | 27.7-34.0s | 收束为可记忆 CTA | 安静、有余味 | 下一次不要先问配几张图。先问：哪个点需要被看见？ | 哪个点需要被看见？ | 小黑推开一扇简笔门，门后只有一张干净正文配图和一句橙色手写结论。 |

## Seedance VFX 合约

### 镜头 1：墨粉锚点

- 来源：白纸右侧问号背后。
- 材质：黑色细墨粉，夹少量蓝色细点。
- 路径：从问号后方螺旋向外，沿小黑拉出的黑线移动。
- 光与物体互动：墨粉掠过纸边时短暂压暗线稿，落点周围出现蓝色系统小点。
- 消散与终点：粉尘在“锚点”二字旁沉降，留下一个黑色小圆点。
- Prompt-ready phrase：`black ink dust particles spiral from behind the question mark, follow the thread pulled by Xiaohei, briefly darken the paper edge, then settle beside the handwritten anchor label`
- Stability constraints：小黑身体、白点眼、中文标题保持稳定；墨粉只绕线运动，不穿过文字主体。

### 镜头 2：红色退回批注

- 来源：右侧弯曲网格顶部。
- 材质：红色手写蜡笔线和纸屑。
- 路径：红线从上方向下压住网格，短纸屑向两侧弹开。
- 光与物体互动：红线覆盖节点边缘，但不遮挡主要字幕。
- 消散与终点：纸屑落到画面底部，留下“退回”批注。
- Prompt-ready phrase：`red crayon correction stroke drops onto the over-neat grid, bends the labels, kicks out tiny paper scraps, then leaves a short handwritten reject mark`
- Stability constraints：节点文字不变形到不可读；小黑仍是扛标签的动作主体。

### 镜头 3：蓝色系统便签

- 来源：锚点秤中心的转轴。
- 材质：蓝色细线、纸片、微弱墨点。
- 路径：四张蓝色便签沿弧线飞到 hook、pain、proof、solution。
- 光与物体互动：蓝线擦过秤盘，给黑色线稿一瞬间的冷色边缘。
- 消散与终点：便签贴稳，蓝色墨点淡出。
- Prompt-ready phrase：`thin blue system notes arc outward from the scale pivot, skim the ink outline with a cool edge, then stick beside four structure labels as the dots fade`
- Stability constraints：秤和小黑杠杆不抖动；蓝色只作为系统反馈。

### 镜头 4：橙色墨流管道

- 来源：低科技机器左侧入口。
- 材质：橙色液态墨线。
- 路径：墨线穿过三段管道，经过筛口时变细，最后进入 16:9 图纸。
- 光与物体互动：橙线反射在黑色管道底部，推着小纸片移动。
- 消散与终点：墨线在输出图纸边缘形成一个箭头并停止。
- Prompt-ready phrase：`orange liquid ink travels through three hand-drawn tubes, narrows at the filter, pushes small paper scraps forward, then stops as a clean arrow on the 16:9 output sheet`
- Stability constraints：机器轮廓和输出图纸比例保持刚性；只用一条主墨流。

### 镜头 5：红色碎纸清理

- 来源：过密节点被橡皮擦到的位置。
- 材质：红色纸屑、灰色铅笔尘。
- 路径：小黑擦过节点，碎纸沿擦除方向向右上方散开。
- 光与物体互动：碎屑遮挡被删除节点，不能覆盖三条 QA 问题。
- 消散与终点：灰尘下沉，留下干净白底。
- Prompt-ready phrase：`Xiaohei erases the crowded nodes; red paper scraps burst along the eraser path, pencil dust sinks, and the page resolves into three short QA questions`
- Stability constraints：三条 QA 文本稳定可读；背景保持纯白。

### 镜头 6：看见之门

- 来源：小黑推开的门缝。
- 材质：橙色细光线、黑色墨点。
- 路径：橙线从门缝向外铺成短路径，墨点沿路径沉降。
- 光与物体互动：门框边缘被橙线轻描，不产生渐变光晕。
- 消散与终点：橙线停在最终句号下方，墨点变成小黑脚边的锚点。
- Prompt-ready phrase：`a thin orange line slips from the door gap, traces the door edge without glow, settles under the final question, and the black dots become a small anchor near Xiaohei's feet`
- Stability constraints：最终 CTA 不被遮挡；小黑保持空表情和认真推门动作。

## 审美复核

- 统一性：92/100。白底、黑线、小黑、红橙蓝批注贯穿全片。
- 叙事目的：94/100。每个镜头都有明确 purpose，并服务说明对象。
- 信息密度：86/100。文本压缩为短句，适合 34 秒说明视频。
- 风格风险：低。主要风险是过像流程图，已通过低科技物件、橡皮、秤、门等物理隐喻规避。
- 修改建议：保持每个镜头一个核心动作，不增加模块数量，不添加真实 UI 截图。
