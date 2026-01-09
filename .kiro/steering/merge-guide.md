# Git 合并指南：保留本地功能

当用户要求从上游合并代码并保留本地特定功能时，遵循以下流程。

## 合并策略

### 1. 识别本地需要保留的功能

询问用户或根据分支名/提交历史判断本地有哪些自定义功能需要保留。

### 2. 执行合并

```bash
git fetch origin main
git merge origin/main
```

### 3. 处理冲突

对于需要保留本地版本的文件：
```bash
git checkout --ours <文件路径>
git add <文件路径>
```

对于需要使用远程版本的文件：
```bash
git checkout --theirs <文件路径>
git add <文件路径>
```

对于需要手动合并的文件（如 locale、api.ts）：
- 读取文件内容，识别冲突标记 `<<<<<<<`、`=======`、`>>>>>>>`
- 保留本地功能相关的代码块
- 保留远程新增的代码块
- 删除冲突标记
- 写入合并后的内容

### 4. 合并后必须检查

前端：
```bash
cd frontend
pnpm format          # 修复行尾符问题
pnpm type-check      # 类型检查
pnpm lint            # Lint 检查
pnpm build           # 构建验证
```

后端：
```bash
uv run pyright AutoGLM_GUI/   # 类型检查
```

## 常见问题修复

### API 导出缺失

前端构建报错 `"xxx" is not exported by "src/api.ts"` 时：
1. 读取报错中缺失的导出名
2. 在 `frontend/src/api.ts` 中添加缺失的函数/类型定义
3. 参考远程版本或根据使用处推断实现

### 后端调度器/管理器冲突

当本地和远程有不同的管理器实现时：
1. 检查 `AutoGLM_GUI/api/__init__.py` 的 `lifespan` 函数
2. 确保导入和启动的是用户想要保留的管理器
3. 确保管理器有正确的初始化（如设置执行器）

### Locale 翻译缺失

合并 locale 文件时：
1. 保留本地功能的完整翻译块
2. 保留远程新增的翻译块
3. 确保 zh.ts 和 en.ts 的 key 一致

### 类型错误

运行 pyright 后修复报告的类型不匹配问题。

## 本项目特定：定时任务功能

本项目有两套定时任务实现：

| 版本 | 模式 | 关键文件 | 数据结构 |
|------|------|----------|----------|
| 本地 | 消息模式 | `scheduled_task_manager.py` | device_id, message, execution_mode, thinking_mode |
| 远程 | 工作流模式 | `scheduler_manager.py` | workflow_uuid, device_serialno |

如果用户要保留本地定时任务：
1. 保留 `AutoGLM_GUI/scheduled_task_manager.py`
2. 保留 `AutoGLM_GUI/api/scheduled_tasks.py`
3. 保留 `frontend/src/routes/scheduled-tasks.tsx`
4. 修改 `AutoGLM_GUI/api/__init__.py`：
   - 导入 `scheduled_task_manager` 而非 `scheduler_manager`
   - 调用 `scheduled_task_manager.start_scheduler()` 而非 `scheduler_manager.start()`
   - 设置任务执行器（如果需要）
5. 确保 `frontend/src/api.ts` 有完整的定时任务 API 类型和函数
6. 确保 locale 文件有完整的 `scheduledTasks` 翻译块
