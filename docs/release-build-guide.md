# AutoGLM-GUI Release 打包指南

## 📦 已生成的 Release 文件

### v1.5.4 Windows 便携版

**位置**: `D:\AutoGLM-GUI\electron\dist\AutoGLM-GUI-v1.5.4-Windows-Portable.zip`
**大小**: 180.3 MB
**包含内容**:
- AutoGLM GUI.exe (主程序)
- Python 后端 (PyInstaller 打包)
- ADB 工具（已内置 adb.exe）
- scrcpy-server
- 所有运行时依赖
- 使用说明.txt

**使用方法**:
1. 解压 zip 文件到任意目录
2. 进入 `win-unpacked` 文件夹
3. 双击运行 `AutoGLM GUI.exe`
4. 详细说明见压缩包内的 `使用说明.txt`

**✅ 已验证**:
- [x] ADB 工具已正确打包（`win-unpacked/resources/adb/windows/platform-tools/adb.exe`）
- [x] Python 后端已打包
- [x] 所有资源文件完整
- [x] 包含详细的使用说明文档

---

## 🛠️ 本地构建流程

### 前置要求

- **Python 3.11+** (虚拟环境 `.venv`)
- **Node.js 22+**
- **pnpm 10+**
- **PyInstaller** (已安装在虚拟环境中)

### 完整构建步骤

#### 1. 构建前端
```bash
cd frontend
pnpm install
pnpm build

# 复制到后端
mkdir -p ../AutoGLM_GUI/static
cp -r dist/* ../AutoGLM_GUI/static/
```

#### 2. 下载 ADB 工具
```bash
# Windows
.venv\Scripts\python.exe scripts/download_adb.py windows
```

#### 3. 打包 Python 后端
```bash
cd scripts
D:\AutoGLM-GUI\.venv\Scripts\pyinstaller.exe autoglm.spec
```

输出: `scripts/dist/autoglm-gui/`

#### 4. 准备 Resources
```bash
# 复制后端
mkdir -p resources
cp -r scripts/dist/autoglm-gui resources/backend

# ADB 工具已在 resources/adb (由步骤2生成)
```

#### 5. 构建 Electron 应用
```bash
cd electron
npm install

# Windows 便携版 (无签名)
npm run build:win -- --publish never
```

输出: `electron/dist/win-unpacked/`

#### 6. 创建发布包
```powershell
# 压缩为 zip
Compress-Archive -Path dist\win-unpacked\* -DestinationPath dist\AutoGLM-GUI-v1.5.4-Windows-Portable.zip -Force
```

---

## 🔧 已解决的问题

### 1. enum34 兼容性问题
**问题**: PyInstaller 报错 "enum34 is incompatible"
**解决方案**: 
```powershell
Remove-Item -Recurse -Force "D:\Anaconda\envs\pytorch-gpu\Lib\site-packages\enum*"
```

### 2. PyInstaller 环境问题
**问题**: PyInstaller 使用了 Anaconda 环境而非项目虚拟环境
**解决方案**: 直接指定虚拟环境中的 pyinstaller.exe 路径
```bash
D:\AutoGLM-GUI\.venv\Scripts\pyinstaller.exe scripts\autoglm.spec
```

### 3. 代码签名工具下载失败
**问题**: electron-builder 无法下载 winCodeSign-2.6.0.7z (网络问题)
**临时方案**: 
- 已生成 `win-unpacked` 解包版本（完整可用）
- 手动创建 zip 压缩包作为便携版
- 暂时跳过 NSIS 安装包生成

**配置修改**: `electron/electron-builder.yml`
```yaml
win:
  sign: null  # 禁用代码签名
```

---

## 📋 发布清单

### 本地已生成
- ✅ Windows 便携版 (zip): `electron/dist/AutoGLM-GUI-v1.5.4-Windows-Portable.zip`
- ✅ Windows 解包版: `electron/dist/win-unpacked/`

### 通过 GitHub Actions 自动生成
- ⏳ Python 包 (PyPI)
- ⏳ Docker 镜像 (ghcr.io)
- ⏳ Windows 安装包 (NSIS)
- ⏳ macOS DMG
- ⏳ Linux AppImage/deb/tar.gz

---

## 🚀 发布到 GitHub Releases

### 方式 1: 使用 Git Tag 触发 CI/CD（推荐）

```bash
# 1. 确认版本号已更新
cat pyproject.toml | grep version  # 应为 1.5.4
cat electron/package.json | grep version

# 2. 创建并推送 tag
git tag v1.5.4
git push origin v1.5.4

# 3. GitHub Actions 会自动:
#    - 构建前端
#    - 打包 Python 后端
#    - 构建 Electron 应用 (Windows/macOS/Linux)
#    - 发布到 PyPI
#    - 推送 Docker 镜像
#    - 上传到 GitHub Releases
```

### 方式 2: 手动上传本地构建产物

```bash
# 1. 创建 GitHub Release
gh release create v1.5.4 --title "v1.5.4" --notes "Release v1.5.4"

# 2. 上传便携版
gh release upload v1.5.4 electron/dist/AutoGLM-GUI-v1.5.4-Windows-Portable.zip
```

---

## 📝 版本管理

### 更新版本号

需要同步更新以下文件:
1. `pyproject.toml` → `project.version`
2. `electron/package.json` → `version`
3. `AutoGLM_GUI/version.py` (如果存在)

### 版本号规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/):
- **主版本号**: 不兼容的 API 修改
- **次版本号**: 向下兼容的功能性新增
- **修订号**: 向下兼容的问题修正

当前版本: **v1.5.4**

---

## 🐛 常见问题

### Q: 如何跳过某些构建步骤?
A: 使用构建脚本的参数:
```bash
.venv\Scripts\python.exe scripts/build_electron.py --skip-frontend --skip-adb
```

### Q: 如何清理构建缓存?
A: 删除以下目录:
```bash
rm -rf electron/dist
rm -rf electron/node_modules
rm -rf scripts/dist
rm -rf scripts/build
rm -rf resources/backend
```

### Q: 网络问题导致 Electron 下载失败?
A: 设置淘宝镜像:
```bash
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

---

## 📚 相关文档

- [PyInstaller 文档](https://pyinstaller.org/)
- [electron-builder 文档](https://www.electron.build/)
- [GitHub Actions 工作流](.github/workflows/release.yml)
- [项目 README](../README.md)

---

**生成时间**: 2026-01-20
**构建环境**: Windows 10, Python 3.11.11, Node.js 22.18.0, pnpm 10.14.0
