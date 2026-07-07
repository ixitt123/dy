# Xiaohei 2.0 Character Style

## Intent

用户要的是“比旧小黑更讨喜、更有动画感的主角”，不是复刻某个已有 IP。把用户提到的“动画大片感、收藏玩偶感、类似潮玩角色的吸引力”翻译成原创视觉语言。不要再输出黑豆线稿、丑脸黑球、廉价低模玩具或角落吉祥物。

## Prompt Translation

Do not write brand or IP names in final prompts. Use this instead:

```text
an original cute cinematic 3D designer-toy character, matte black and charcoal body, soft vinyl and short plush texture, oversized head and small body, rounded triangular ears or soft little horn-like tufts, expressive glossy glass eyes with tiny catchlights, small nose, subtle smiling mouth, one tiny harmless tooth, short arms and legs, playful but serious personality, slightly mischievous animated posture, clean white studio background, hand-drawn black structure lines and sparse Chinese annotations around it, original silhouette, not based on any existing character
```

中文可写：

```text
原创可爱 3D 动画潮玩主角，黑色与深炭色软胶/短绒材质，大头小身体，圆润三角耳或柔软小角轮廓，大而清澈的玻璃眼带小高光，小鼻子、小嘴和一颗不夸张的小尖牙，短手短腿，认真但有一点调皮，姿态有动画电影级表演感，动作明确地参与画面核心工作，白底，周围是黑色手绘结构线和少量中文手写批注，原创轮廓，不复刻任何已有角色。
```

## Shape Language

- Head/body: oversized head with a small compact body, not a stick figure or bean doodle.
- Ears/tufts: rounded triangular ears or soft little horn-like tufts, clearly original and not copied from an existing toy.
- Eyes: large, clear, reflective glassy eyes, emotionally readable.
- Face: tiny nose, subtle smiling mouth, one small harmless tooth; never scary or ugly.
- Limbs: short and simple so actions read quickly.
- Material: matte vinyl, soft plush, gentle bevels, subtle ambient occlusion.
- Color: black/charcoal base; no rainbow palette. Red, orange, blue remain annotation colors, not character costume colors.
- Pose: the role is a working operator. It pushes, pulls, carries, opens, erases, tunes, catches, and reveals.

## Do Not

- Do not write "Pixar style", "Labubu style", or any existing character/studio name in final prompts.
- Do not copy specific ears, teeth, face proportions, accessories, logos, or signature silhouettes from existing IP.
- Do not make Xiaohei ugly, frightening, dirty, wrinkled, low-poly, or like a cheap blind-box toy.
- Do not make the character cute but passive.
- Do not add complex clothing, brand marks, or glossy toy packaging.
- Do not let the character replace the explanatory structure; it should make the structure memorable.

## Per-Shot Character Contract

For every shot, write:

- `identity_anchor`: what stays visually consistent.
- `action`: what the character physically does.
- `contact_point`: what object, line, door, lever, paper, or label it touches.
- `emotion`: serious / curious / mischievous / focused.
- `stability_constraints`: what must not change during VFX.

Example:

```json
{
  "identity_anchor": "original cute black 3D designer-toy protagonist with rounded ears, glossy glass eyes, soft vinyl plush texture and one tiny harmless tooth",
  "action": "pulls one orange thread out of a messy paragraph cloud",
  "contact_point": "orange thread and paper cloud edge",
  "emotion": "focused and slightly mischievous",
  "stability_constraints": "keep eyes, silhouette and hand position stable while ink particles move around the thread"
}
```
