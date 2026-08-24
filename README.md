# Folio — Browser LaTeX Notes

> 零安装、浏览器即用的 LaTeX 笔记工作台。

[![Static App](https://img.shields.io/badge/app-static-3b7f6d)](#快速开始)
[![No LaTeX Required](https://img.shields.io/badge/LaTeX-install%20not%20required-ca5738)](#快速开始)
[![Project Format](https://img.shields.io/badge/export-standard%20ZIP-555)](#项目格式)

## 界面预览

### LaTeX 编辑与即时排版

![Folio LaTeX 编辑工作台](./docs/screenshots/workspace.png)

### 数学公式指南与一键插入

![Folio LaTeX 数学公式指南](./docs/screenshots/formula-guide.png)

一个零安装、纯浏览器的 LaTeX 笔记工作台。支持 CMU 风格课程笔记、实时快速预览、语法速查、图片、本地恢复草稿、标准 LaTeX ZIP 项目，以及 GitHub 保存。

另外支持将 Markdown 转换进 CMU LaTeX 模板，以及复制为适合粘贴到知乎文章编辑器的富文本。

## 功能

- CMU Notes 风格课程笔记模板
- LaTeX 与数学公式即时预览
- 源码与预览双向定位：左侧选词后点击“↔ 定位”或直接双击，右侧双击文字可反选源码
- 38 个分类公式模板、搜索、自定义预览和一键插入
- Markdown 语法树转换，支持标题、嵌套列表、引用、表格、代码和公式
- 本地图片选择或剪贴板直接粘贴，并与 `main.tex` 一起导出
- IndexedDB + localStorage 双层崩溃恢复
- 标准 LaTeX ZIP 项目导入/导出
- GitHub Contents API 保存
- 知乎富文本复制与知乎 Markdown 导出
- 响应式分栏、缩放、打印及 PDF 输出

## 快速开始

下载或克隆仓库：

```bash
git clone https://github.com/KetenBieber/latex-note-tools.git
cd latex-note-tools
```

直接双击 `index.html` 即可。为获得稳定的剪贴板、CDN 和 GitHub API 支持，也可以使用任意静态服务器：

```bash
cd latex-notes
python -m http.server 4173
```

访问 <http://localhost:4173>。应用本身不需要安装 Node.js、LaTeX、MiKTeX 或 TeX Live；上面的 Python 命令只是可选静态服务器。

## 使用

1. 点击“模板”选择笔记类型；默认是 CMU 风格课程笔记。
2. 左侧编辑，右侧即时预览。左侧选中文字后点击“↔ 定位”（或按 `Alt + Enter`）即可在预览中高亮对应文字；直接双击左侧单词也可以定位。
3. 双击右侧预览中的文字，会在左侧选中对应的 LaTeX 源码；单击段落则定位到对应源码行。
4. 点击工具栏“图片”插入图片。
5. 点击“公式指南”或工具栏的 `ƒ(x)`，搜索并一键插入数学公式。
6. 点击“保存项目 ZIP”下载标准项目包。
7. 下次点击“打开 ZIP 项目”恢复正文和图片。

## Markdown 与知乎

- 点击“导入 Markdown”选择 `.md` 或 `.markdown` 文件。
- 标题、分点、编号、引用、粗斜体、链接、代码块和数学公式会转换成 LaTeX。
- Markdown 一级标题会成为文档标题，其余标题映射为 LaTeX 章节。
- Markdown 引用会转换为 CMU 风格的“直觉”盒子。
- Markdown 远程或相对图片会保留为图片引用提示；建议再用“图片”按钮把本地图片加入项目 ZIP。
- 点击“复制到知乎”可复制富文本，随后粘贴到知乎文章编辑器；也可以下载一份知乎 Markdown。

知乎粘贴后应检查公式和图片。平台编辑器可能过滤外部样式，本地图片通常需要在知乎侧重新确认上传。

## 项目格式

Folio 不使用私有文档格式。导出的 ZIP 内部是普通 LaTeX 结构：

```text
main.tex
images/
  figure.png
README.txt
```

可以解压后使用任意 LaTeX 编辑器，也可以上传 ZIP 到 Overleaf。项目使用标准的 `.tex` 和图片文件，不依赖 Folio 私有格式。

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/⌘ + S` | 立即更新浏览器恢复草稿 |
| `Ctrl/⌘ + Shift + S` | 下载标准 LaTeX ZIP 项目 |
| `Alt + Enter` | 把左侧当前选中文字定位并高亮到右侧预览 |
| `Tab` | 在编辑器插入两个空格 |
| `Ctrl/⌘ + V` | 直接粘贴剪贴板图片并插入标准 figure |

## 自动恢复与稳定性

- 每次输入约 0.45 秒后，正文和图片会写入浏览器 IndexedDB 恢复区。
- `localStorage` 同时保存一份纯文本恢复草稿。
- 页面刷新或浏览器意外关闭后会自动恢复最近草稿。
- `Ctrl+S` 立即更新恢复草稿；`Ctrl+Shift+S` 下载标准项目 ZIP。
- 浏览器安全模型不允许网页在未授权时静默覆盖磁盘文件，因此 ZIP 仍建议在关键节点手动保存。

## 预览能力边界

即时预览由轻量结构解析器和 KaTeX 完成，覆盖标题、段落、列表、公式、定义/定理/例题/直觉/总结盒子、代码和图片。它速度快且无需安装，但不是完整 TeX 引擎。

自定义宏、TikZ、复杂表格、BibTeX 和任意第三方宏包会原样保存在 `main.tex` 中，但不保证在快速预览里完全呈现。把 ZIP 上传 Overleaf 或交给任意标准 LaTeX 环境即可完整编译。

## 技术说明

这是一个不需要构建步骤的静态 Web App：

- KaTeX：数学公式排版
- Marked：Markdown 语法树解析
- IndexedDB：包含图片的恢复草稿
- Web Clipboard API：知乎富文本复制
- GitHub Contents API：仓库文件提交
- 浏览器原生 ZIP 编解码：标准项目导入导出

所有编辑内容默认保留在浏览器本地。GitHub Token 不会写入 localStorage 或项目文件。

## GitHub

创建 Fine-grained personal access token，仅选择目标仓库，并授予 `Contents: Read and write`。Token 只存在当前页面输入框中，不写入浏览器存储。
