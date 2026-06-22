# 剪映模板母版目录说明

本目录只提交模板配置和导入说明，不提交真实剪映私有草稿、素材大文件或本机生成文件。

每个模板母版请按以下结构放置：

```text
templates/jianying/<template_id>/
  template.config.json
  draft_template/
    <剪映母版草稿文件和目录>
```

当前代码内置的推荐模板 ID：

- `education_tips`：学习技巧
- `promo_commercial`：商业宣传
- `enrollment_conversion`：招生转化
- `black_gold_business`：黑金商业
- `clean_knowledge_card`：清爽知识卡片
- `campus_education`：校园教育
- `three_d_story`：3D动画故事
- `parent_dialogue`：家长对话
- `fast_hook_talk`：强钩子口播
- `case_breakdown`：案例拆解

使用方式：

1. 在剪映专业版中准备一个可复用母版草稿。
2. 复制或导出母版草稿目录。
3. 在成片中心点击“导入模板”，选择已解压的母版目录。
4. 系统会复制到 `templates/jianying/<template_id>/draft_template`，并参与自动推荐。

注意：

- 不要提交包含个人素材、账号信息或大体积视频的母版草稿。
- 如果模板母版缺失，系统会明确提示，并不会假装已导入剪映草稿。
- 如果剪映程序路径或草稿目录缺失，成片中心会提示填写；能自动推断时会显示默认候选路径。
