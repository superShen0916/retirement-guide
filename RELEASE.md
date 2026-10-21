# 发布说明

所有案例为虚构，模板未填写私人数据。网页与离线阅读版从同一份正文生成，下面是 v0.3.0 起的维护步骤。

## 更新内容与网页

日常内容改 `docs/`、`templates/`、README；决策条目和虚构账本改 `data/`。`docs/LIBRARY.md`与`docs/CASEBOOK.md`由`tools/build_library.py`生成，不直接编辑。首页、月度及年度计算器改 `site/`；六篇场景位于 `docs/scenarios/`，不要直接改 `dist/` 里生成的网页。

PowerShell / Bash 在仓库根目录运行相同命令，需要 Python 3.10+；月度模型测试另需 Node.js 22+，没有 npm 依赖。

```bash
python tools/build_cases.py
python tools/build_library.py
python tools/build_reader.py
python tools/build_site.py
python -m unittest discover -s tests -v
node --test tests/test_runway.mjs tests/test_lifetime.mjs
python tools/check_links.py
```

双击 `dist/index.html` 进行离线体验，或用 `python -m http.server 8770 --directory dist` 本地预览。手机窄屏需检查字段、结果、图表和正文表格；分享前检查复制的文本是否包含私人金额。

`阅读版.html` 是独立的完整长文；`dist/` 是可直接托管的静态网站。两个生成器统一写出 UTF-8 / LF，以便 Windows 与 Linux 构建一致。内容更新日期与政策核查日期分别维护，不因改版就把政策日期改成今天。

## 网站发布接续

网页入口：[退休之前](https://retirement-before.supershen666.chatgpt.site)。Sites 项目标识与静态目录配置位于 `.openai/hosting.json`，后续更新复用现有 ID，不重建同名站点。网站发布与 GitHub 仓库的公开/私有权限分别管理。

部署使用 Sites 原生工具和配套 source workflow：运行 `python tools/stage_site.py`，将经过白名单筛选的源码及 dist 放入独立、已忽略的部署工作目录 `.deploy/retirement-before`，通过短期凭证推送对应源状态并打包，再保存版本和部署；凭证只在内存中经标准输入传入，不写入文件。发布后记录版本/部署结果及生产 URL。`.deploy/`、私人填写、环境目录不进入 GitHub 或公开网站。

GitHub 源码更新先看 `git status`，只提交本次经过检查的源文件；不要把 `private/`、真实账单、CSV测算输出或 `.venv/` 加入版本库。

部署仓库由准备脚本单独跟踪已构建的 `dist/`，因此原生文件上传通道不可用时，可使用同一已推送提交的静态资源进行远程构建回退。GitHub 的创作仓库仍忽略 `dist/`；两者都保留可重复生成的正文与脚本。

## 以下为首次建库参考

## 手工上传

在 GitHub 新建空仓库，建议命名 `retirement-guide`。自行选择公开或私有；本交付不预设公开。解压后上传本目录内的文件，保留 `docs`、`tools`、`tests`、`examples` 等目录结构。README 会自动显示为首页。不要上传包含个人数据的填写版或输出。

## 使用 Git

以下命令在本目录执行；先用实际创建的仓库地址替换 REMOTE_URL，再运行最后两行。Git 身份使用你自己的配置。

```bash
git init -b main
git add .
git commit -m "Initial retirement guide v0.2.0"
git remote add origin REMOTE_URL
git push -u origin main
```

仓库附有测试工作流。离线阅读版无需部署即可打开。后续发布前，更新政策核查日期、SOURCES、CHANGELOG，并重新运行测试和阅读版构建。
