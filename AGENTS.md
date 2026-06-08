# 项目协作规则

## Git同步规则

每次完成代码修改后：

1. 运行测试
2. 确认无报错
3. git add .
4. git commit -m "功能名称+时间"
5. git push origin main

## 开始工作前

任何开发任务开始前：

1. 先执行 git pull origin main
2. 检查远程是否有更新
3. 如果存在冲突，先解决冲突再开发

## 开发原则

* 不允许直接删除核心代码
* 修改前先分析影响范围
* 优先保持向后兼容
* 每次功能开发必须提交到GitHub

## 自动备份

所有代码修改完成后必须推送GitHub。

禁止出现本地已修改但未同步情况。

## 输出要求

每次任务完成后输出：

* 修改文件列表
* Git提交信息
* Push结果
* 是否同步成功

## 多电脑协作规则

我有两台电脑（家里和公司）。

GitHub是唯一代码源。

开发规则：

1. 每次开始工作前自动执行：
   git pull origin main

2. 每次完成任务后自动执行：
   git add .
   git commit -m "自动备份"
   git push origin main

3. 如果push失败：
   先git pull
   自动处理可解决冲突
   再push

4. 所有开发记录保存在GitHub。

5. 不允许只保存在本地。

6. 每次完成任务后告诉我：

   * 是否已提交
   * Commit ID
   * Push是否成功

## 项目架构优先规则

这个项目采用：

* AGENTS.md
* SKILLS/
* PROMPTS/
* MCP/

架构优先。

禁止直接堆代码。

先设计Skill。

再设计Prompt。

最后开发功能。
