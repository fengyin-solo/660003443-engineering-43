# 语言词源图谱与多语系演化追踪
D3.js力导向图词源网络 · 印欧语系演化树 · 同源词多语对照

## 词根数据维护

词根数据在 `frontend/src/mock/data.ts`（`COGNATE_SETS` / `LANGUAGE_FAMILIES`）。每次补充数据后，在 `frontend/` 下运行：

```bash
npm run check        # 数据检查 + 页面构建（vue-tsc + vite build）
npm run check:data   # 只跑数据检查
```

数据检查（`frontend/scripts/check-data.ts`）自动覆盖原先人工核对的事项：

- **格式**：必填字段、词根书写规范（`*` 开头）、重复词根、空词形等
- **联动**：词根 `family` 与语系声明一致、语言归属正确、`buildGraph()` 图谱无孤点/悬空边、新语言在对照表有列、新语系在图谱有配色
- **构建**：`vue-tsc` 类型检查 + `vite build`

检查结果分三级：`error` 必须修复（退出码 1，CI 拦截）、`warning` 建议处理、`info` 仅为提示。push / PR 会由 GitHub Actions 自动执行同样的检查（`.github/workflows/check.yml`）。
