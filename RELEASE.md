# 发布说明

此页是维护者的首次建库与后续发布说明。所有案例为虚构，模板未填写私人数据。

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
