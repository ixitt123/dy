---
name: visual-style-lock
description: 锁定同一视频内的画面风格、色调、构图和人物/场景连续性，提升分镜图片统一性。
---

# Visual Style Lock

## 输入

- Premium Video Director 风格规则。
- Shotlist。
- 主题、受众、品牌色、人物/场景设定。
- 可选参考图或已生成图片资产。

## 输出

- `style_lock`：统一色调、光线、材质、字体、构图、人物、场景、负面规则。
- 每个 shot 的增强版 `visual_prompt`。
- 统一负面提示词和一致性检查项。

## 禁止事项

- 不允许同一视频内色调、字体和场景风格漂移。
- 不允许普通插画感、廉价海报感、随机 AI 图感。
- 不允许画面里出现错误中文、乱码、奇怪水印或无关 logo。
- 不允许把每个镜头当成独立海报生成。

## 成功标准

- 每个镜头都继承同一个 `style_lock`。
- 画面比例统一，默认抖音/视频号/小红书为 9:16。
- 主体、场景、色彩、光线和质感有连续性。
- 图片资产能被路线 B/C/A 的 Timeline 复用。

## 错误处理

- 缺少参考风格时使用“高级商业短视频、真实质感、干净构图、电影级光线”默认风格。
- 风格词过少时自动补充色彩、镜头、光线、材质和负面规则。
- Provider 不支持负面提示词时把禁用规则写入主 prompt。

## 可扩展 Provider

- Seedream 图像 Provider。
- 即梦图像 Provider。
- 风格参考图 Provider。
- VLM 一致性审查 Provider。

## 与现有模块的关系

- 修正图片中心从 AI 导演导入的 `image_prompt`。
- 批量分镜图生成必须先经过本 Skill。
- 生成资产写入现有图片资产库，供 Video Product Center 自动绑定。
