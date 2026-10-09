import { readFile, writeFile } from 'node:fs/promises';

const endpoint = process.env.FOLIO_CDP || 'http://127.0.0.1:9222';
const appUrl = process.env.FOLIO_URL || 'http://127.0.0.1:4173';
const pages = await fetch(`${endpoint}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.startsWith(appUrl));
if (!page) throw new Error('没有找到 Folio 页面；请先启动静态服务器和带远程调试端口的浏览器。');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await command('Runtime.enable');
await command('Page.enable');
const loaded = new Promise(resolve => {
  const listener = event => {
    if (JSON.parse(event.data).method !== 'Page.loadEventFired') return;
    socket.removeEventListener('message', listener);
    resolve();
  };
  socket.addEventListener('message', listener);
});
await command('Page.reload', { ignoreCache: true });
await loaded;

const boot = await evaluate(`(async () => { const started = performance.now(); while (!document.querySelector('#preview')?.children.length && performance.now() - started < 2500) await new Promise(resolve => setTimeout(resolve, 40)); return { ready: document.readyState, update: typeof update, preview: !!document.querySelector('#preview')?.children.length }; })()`);
assert(boot.update === 'function' && boot.preview, `应用没有正常启动：${JSON.stringify(boot)}`);

const filenames = await evaluate(`(() => {
  titleInput.value = '控制/系统:笔记.';
  updateWindowTitle();
  const tex = documentFilename('tex'), zip = documentFilename('zip'), markdown = documentFilename('.md');
  document.querySelector('#githubBtn').click();
  const github = document.querySelector('#ghPath').value;
  document.querySelector('#githubDialog').close();
  preparePrint();
  const pdf = document.title + '.pdf';
  window.dispatchEvent(new Event('afterprint'));
  return { tex, zip, markdown, pdf, github, tabTitle: document.title };
})()`);
assert(filenames.tex === '控制-系统-笔记.tex'
  && filenames.zip === '控制-系统-笔记.zip'
  && filenames.markdown === '控制-系统-笔记.md'
  && filenames.pdf === '控制-系统-笔记.pdf'
  && filenames.github === 'notes/控制-系统-笔记.tex'
  && filenames.tabTitle === '控制/系统:笔记. — Folio', `导出文件名没有统一跟随标题：${JSON.stringify(filenames)}`);

const toolbar = await evaluate(`(() => {
  const input = document.querySelector('#editor');
  input.value = String.raw\`\\documentclass{article}
\\begin{document}
alpha
beta
\\end{document}\`;
  input.setSelectionRange(input.value.indexOf('alpha'), input.value.indexOf('alpha') + 5);
  const highlight = document.querySelector('#highlightSelect');
  highlight.value = 'yellow!45';
  highlight.dispatchEvent(new Event('change', { bubbles: true }));
  const highlighted = input.value.includes(String.raw\`\\colorbox{yellow!45}{\\strut alpha}\`);

  const beta = input.value.indexOf('beta');
  input.setSelectionRange(beta, beta + 4);
  const color = document.querySelector('#textColorSelect');
  color.value = 'blue';
  color.dispatchEvent(new Event('change', { bubbles: true }));
  const colored = input.value.includes(String.raw\`\\textcolor{blue}{beta}\`);

  input.value = '第一点\\n第二点';
  input.setSelectionRange(0, input.value.length);
  document.querySelector('#bulletListBtn').click();
  const list = input.value.includes(String.raw\`\\begin{itemize}\`) && (input.value.match(/\\\\item /g) || []).length === 2;

  input.value = 'const answer = 42;';
  input.setSelectionRange(0, input.value.length);
  document.querySelector('#codeBlockBtn').click();
  const code = input.value.includes(String.raw\`\\begin{verbatim}\`) && input.value.includes('const answer = 42;');

  input.value = String.raw\`\\documentclass{article}
\\begin{document}
underline
\\end{document}\`;
  const underlineStart = input.value.indexOf('underline');
  input.setSelectionRange(underlineStart, underlineStart + 9);
  document.querySelector('#underlineBtn').click();
  const underlined = input.value.includes(String.raw\`\\underline{underline}\`);
  const waveStart = input.value.indexOf('underline', underlineStart);
  input.setSelectionRange(waveStart, waveStart + 9);
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, shiftKey: true, key: 'u' }));
  const wavy = input.value.includes(String.raw\`\\uwave{underline}\`) && input.value.includes(String.raw\`\\usepackage{ulem}\`);
  return { highlighted, colored, list, code, underlined, wavy };
})()`);
assert(Object.values(toolbar).every(Boolean), `工具栏插入失败：${JSON.stringify(toolbar)}`);

const previewHeadingAndStats = await evaluate(`(() => {
  const source = String.raw\`\\documentclass{article}
\\begin{document}
\\tableofcontents
\\section[短标题]{R\\&D：\\textbf{USB\\_FS 与 $x_{i}^{2}$} \\#1}
正文测试 alpha beta。
\\subsection{嵌套 {花括号} 与 50\\%}
更多正文。
\\end{document}\`;
  editor.value = source;
  preview.innerHTML = compile(source);
  updateDocumentStats();
  const links = [...preview.querySelectorAll('.note-toc a')];
  const headings = [...preview.querySelectorAll('h2,h3')];
  return {
    linkCount: links.length,
    headingCount: headings.length,
    tocText: links.map(link => link.textContent.replace(/\\s+/g, ' ').trim()),
    idsResolve: links.every(link => preview.querySelector(link.getAttribute('href'))),
    noRawCommands: !preview.textContent.includes('\\\\section') && !preview.textContent.includes('\\\\textbf'),
    stats: document.querySelector('#documentStats').textContent,
    wordCount: countDocumentWords(source),
  };
})()`);
assert(previewHeadingAndStats.linkCount === 2 && previewHeadingAndStats.headingCount === 2 && previewHeadingAndStats.idsResolve && previewHeadingAndStats.noRawCommands && previewHeadingAndStats.tocText.some(text => text.includes('USB_FS')) && previewHeadingAndStats.wordCount > 10 && previewHeadingAndStats.stats.includes('正文'), `特殊标题目录或字数统计失败：${JSON.stringify(previewHeadingAndStats)}`);

const outlineAndHeadingMath = await evaluate(`(() => {
  const input = document.querySelector('#editor');
  const source = String.raw\`\\documentclass{article}
\\begin{document}
\\tableofcontents
\\section{定义 KL divergence}
\\subsection{为什么 \\[ P = Q ? \\] 的最小值出现在这里}
\\subsubsection{回到前面的例子}
\\end{document}\`;
  input.value = source;
  update(false, { forceRender: true });
  renderLatestPreview();
  renderSourceOutline(true);
  const tocTitle = preview.querySelector('.toc-level-2 .toc-title');
  const nestedMathSpan = tocTitle?.querySelector('.katex-html span');
  const buttons = [...document.querySelectorAll('#sourceOutlineList button')];
  document.querySelector('#sourceOutline').classList.add('open');
  const panelRect = document.querySelector('#sourceOutlinePanel').getBoundingClientRect();
  const editorPaneRect = document.querySelector('.editor-pane').getBoundingClientRect();
  const triggerRect = document.querySelector('#sourceOutlineTrigger').getBoundingClientRect();
  const lineNumberRect = document.querySelector('#lineNumbers').getBoundingClientRect();
  buttons[1].click();
  return {
    tocChildren: preview.querySelector('.toc-level-2 a')?.children.length,
    hasDisplayMath: Boolean(tocTitle?.querySelector('.katex-display,.display-math')),
    tocText: tocTitle?.textContent.replace(/\\s+/g, ' ').trim(),
    nestedMathMinWidth: nestedMathSpan ? parseFloat(getComputedStyle(nestedMathSpan).minWidth) || 0 : -1,
    panelFitsEditor: panelRect.left >= editorPaneRect.left && panelRect.right <= editorPaneRect.right + 1,
    railAvoidsLineNumbers: triggerRect.right <= lineNumberRect.left + 1,
    outlineCount: buttons.length,
    outlineNumbers: buttons.map(button => button.querySelector('.source-outline-number')?.textContent),
    selected: input.value.slice(input.selectionStart, input.selectionEnd),
    highlighted: Boolean(preview.querySelector('#folio-heading-2.source-sync-highlight')),
  };
})()`);
assert(outlineAndHeadingMath.tocChildren === 2 && !outlineAndHeadingMath.hasDisplayMath && outlineAndHeadingMath.tocText.includes('P = Q') && outlineAndHeadingMath.nestedMathMinWidth < 10 && outlineAndHeadingMath.panelFitsEditor && outlineAndHeadingMath.railAvoidsLineNumbers && outlineAndHeadingMath.outlineCount === 3 && outlineAndHeadingMath.outlineNumbers.join(',') === '1,1.1,1.1.1' && outlineAndHeadingMath.selected.includes('为什么') && outlineAndHeadingMath.highlighted, `标题公式或左侧目录跳转失败：${JSON.stringify(outlineAndHeadingMath)}`);

const linkedFolder = await evaluate(`(async () => {
  const written = {};
  const fileHandle = path => ({ kind: 'file', createWritable: async () => ({ write: async value => { written[path] = typeof value === 'string' ? value : new Uint8Array(value); }, close: async () => {} }) });
  const imagesDirectory = { kind: 'directory', getFileHandle: async name => fileHandle('images/' + name) };
  linkedProjectHandle = { kind: 'directory', name: 'linked-note', queryPermission: async () => 'granted', getFileHandle: async name => fileHandle(name), getDirectoryHandle: async name => imagesDirectory };
  linkedProjectName = linkedProjectHandle.name;
  editor.value = String.raw\`\\documentclass{article}\\begin{document}已同步\\end{document}\`;
  projectImages = { 'tiny.png': 'data:image/png;base64,AQID' };
  markProjectImagesChanged();
  update(false);
  const result = await syncLinkedProject();
  linkedProjectHandle = null; linkedProjectName = '';
  setLocalProjectStatus('浏览器草稿 · 未关联文件夹');
  return { saved: result.saved, main: written['main.tex'], imageBytes: Array.from(written['images/tiny.png'] || []) };
})()`);
assert(linkedFolder.saved && linkedFolder.main.includes('已同步') && JSON.stringify(linkedFolder.imageBytes) === JSON.stringify([1, 2, 3]), `关联项目文件夹写回失败：${JSON.stringify(linkedFolder)}`);

const history = await evaluate(`(async () => {
  const input = document.querySelector('#editor');
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  input.value = '初始内容';
  input.setSelectionRange(input.value.length, input.value.length);
  resetEditorHistory();
  for (const character of ['A', 'B', 'C']) {
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: character }));
    input.setRangeText(character, input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: character }));
  }
  await wait(500);
  undoEditor();
  const undone = input.value === '初始内容';
  redoEditor();
  const redone = input.value === '初始内容ABC';
  return { undone, redone };
})()`);
assert(Object.values(history).every(Boolean), `延迟撤销历史失败：${JSON.stringify(history)}`);

const zhihu = await evaluate(`(() => {
  const input = document.querySelector('#editor');
  input.value = String.raw\`\\documentclass{article}
\\usepackage{xcolor}
\\begin{document}
\\section{导出测试}
\\colorbox{yellow!45}{\\strut 荧光重点}与\\textcolor{blue}{蓝色文字}。
\\begin{itemize}
\\item 第一项
\\item 第二项
\\end{itemize}
\\begin{verbatim}
const answer = 42;
\\end{verbatim}
\\begin{table}
\\caption{速度表}
\\begin{tabular}{ll}
\\toprule
名称 & 数值 \\\\
\\midrule
速度 & 42 \\\\
\\bottomrule
\\end{tabular}
\\end{table}
\\begin{equation}
E = mc^2
\\end{equation}
\\end{document}\`;
  update(false);
  const result = buildZhihuClipboard();
  return {
    headings: (result.html.match(/<h1[ >]/g) || []).length,
    list: result.html.includes('<ul'),
    code: result.html.includes('<pre'),
    table: result.html.includes('<table'),
    inlineStyle: result.html.includes('style='),
    effects: result.html.includes('rgb(255, 240, 154)') && result.html.includes('rgb(36, 87, 197)'),
    clean: !/data-source-|note-toc|katex-mathml/.test(result.html),
    markdown: result.plain.includes(String.fromCharCode(96).repeat(3)) && result.plain.includes('$$') && result.plain.includes('| 名称 | 数值 |'),
  };
})()`);
assert(zhihu.headings === 1 && Object.entries(zhihu).filter(([key]) => key !== 'headings').every(([, value]) => value), `知乎导出失败：${JSON.stringify(zhihu)}`);

const fidelitySource = String.raw`\documentclass{article}
\begin{document}
\section{符号 \& 嵌套格式与 $x_{i}$}
文件名 \texttt{CDC\_Transmit\_FS}，比例 50\%，集合 A \& B，价格 \$5，编号 \#1。
\textbf{外层 \textit{内层强调}}，反向嵌套 \textit{斜体含 \textbf{粗体}}，以及行内公式 $x_i^2 + \text{a_b}$。
\begin{equation}
E=mc^2
\label{eq:energy}
\end{equation}
公式 \eqref{eq:energy} 是质能关系。
\begin{align}
a+b &= c \\
x+y &= z
\end{align}
\begin{itemize}
\item 第一项
  \begin{enumerate}
  \item 嵌套编号
  \end{enumerate}
\item 第二项
\end{itemize}
\begin{whybox}[嵌套 \textbf{提示}]
这里包含 \textit{强调内容}。
\end{whybox}
未知引用 \ref{missing:key} 不应显示问号。
\end{document}`;
const fidelity = await evaluate(`(() => {
  const markdown = latexToZhihuMarkdown(${JSON.stringify(fidelitySource)});
  const rendered = window.marked?.parse(markdown, { gfm: true }) || '';
  const proseOnly = markdown.replace(/\\$\\$[\\s\\S]*?\\$\\$/g, '').replace(/(?<!\\\\)\\$[^\\n$]+(?<!\\\\)\\$/g, '');
  const slash = String.fromCharCode(92), tick = String.fromCharCode(96);
  return {
    symbols: markdown.includes(tick + 'CDC_Transmit_FS' + tick) && markdown.includes('50%') && markdown.includes('A & B') && markdown.includes(slash + '$5') && markdown.includes('#1'),
    heading: markdown.startsWith('## 符号 & 嵌套格式与 $x_{i}$') && rendered.includes('<h2>'),
    inlineMath: markdown.includes('$x_i^2 + ' + slash + 'text{a_b}$'),
    displayMath: markdown.includes(slash + 'tag{1}') && markdown.includes(slash + 'begin{aligned}') && markdown.includes('a+b &= c ' + slash + slash),
    references: markdown.includes('公式 (1)') && markdown.includes('[missing:key]') && !markdown.includes('?'),
    nestedFormatting: rendered.includes('<strong>外层 <em>内层强调</em></strong>') && rendered.includes('<em>斜体含 <strong>粗体</strong></em>'),
    nestedLists: rendered.includes('<ul>') && rendered.includes('<ol>'),
    box: rendered.includes('<blockquote>') && rendered.includes('直觉：嵌套') && rendered.includes('强调内容'),
    cleanProse: !/\\\\(?:textbf|textit|eqref|ref|begin|end)\\b/.test(proseOnly),
  };
})()`);
assert(Object.values(fidelity).every(Boolean), `LaTeX → Markdown 一致性失败：${JSON.stringify(fidelity)}`);

const zhihuArticleFormatting = await evaluate(`(() => {
  const source = String.raw\`\\documentclass{article}
\\begin{document}
第一段第一行
第一段第二行
\\begin{itemize}
\\item 第一项第一段

第一项第二段
  \\begin{enumerate}
  \\item 嵌套编号 A
  \\item 嵌套编号 B
  \\end{enumerate}
\\item 第二项
\\end{itemize}
\\[
q_i=\\prod_{t=1}^{n}P(x_t)
\\]
公式后的正文
百分比 $50%$ 后文保留
\\[
x=50%
\\]
旧文件残缺 $50
\\textbf{整句加粗}
段内包含 \\textbf{局部加粗} 内容
\\textbf{跨行
加粗句子}
\\end{document}\`;
  const markdown = latexToZhihuMarkdown(source);
  const rendered = window.marked.parse(markdown, { gfm: true });
  const imported = smartMarkdownToLatex(String.raw\`# 数学导入

导入第一段
导入第二段

$$
q_i=\\prod_{t=1}^{n}P(x_t)
$$

公式后的段落\`);
  const roundtrip = latexToZhihuMarkdown(imported.content);
  const importedStrong = smartMarkdownToLatex('**跨行加粗第一部分\\n第二部分**', '加粗导入');
  const strongRoundtrip = latexToZhihuMarkdown(importedStrong.content);
  const exportedMathBlocks = [...markdown.matchAll(/\\$\\$\\n([\\s\\S]*?)\\n\\$\\$/g)].map(match => match[1]);
  const mathBlocks = [...roundtrip.matchAll(/\\$\\$\\n([\\s\\S]*?)\\n\\$\\$/g)].map(match => match[1]);
  const slash = String.fromCharCode(92);
  const repairedLineBreak = normalizeZhihuMathSource('a&=b' + slash + '\\n&=c').split('\\n')[0];
  return {
    paragraphIndent: markdown.includes('　　第一段第一行') && markdown.includes('　　第一段第二行') && markdown.includes('　　公式后的正文'),
    paragraphBreak: markdown.includes('第一段第一行\\n\\n　　第一段第二行'),
    listContinuation: markdown.includes('- 第一项第一段\\n\\n    第一项第二段') && markdown.includes('    1. 嵌套编号 A') && markdown.includes('    2. 嵌套编号 B'),
    renderedNestedList: /<ul>[\\s\\S]*<ol>[\\s\\S]*嵌套编号 A/.test(rendered),
    mathPreserved: exportedMathBlocks.some(block => block.includes(String.raw\`q_i=\\prod_{t=1}^{n}P(x_t)\`)),
    mathSnippet: markdown.match(/\\$\\$[\\s\\S]*?\\$\\$/)?.[0],
    importMathPreserved: imported.content.includes(String.raw\`\\[
q_i=\\prod_{t=1}^{n}P(x_t)
\\]\`) && mathBlocks.some(block => block.includes(String.raw\`q_i=\\prod_{t=1}^{n}P(x_t)\`)),
    formulaBoundary: roundtrip.includes('$$\\n\\n　　公式后的段落'),
    formulaLineBreakRepair: repairedLineBreak.endsWith(slash + slash),
    percentPreserved: markdown.includes('$50\\\\%$ 后文保留') && exportedMathBlocks.some(block => block.includes('x=50\\\\%')),
    percentSnippet: markdown.split('\\n').filter(line => line.includes('50')).slice(-4),
    unmatchedDollarProtected: markdown.includes('旧文件残缺 \\\\$50'),
    standaloneBoldAligned: markdown.includes('　　**整句加粗**'),
    inlineBoldAligned: markdown.includes('　　段内包含 **局部加粗** 内容'),
    multilineBoldAligned: markdown.includes('　　**跨行 加粗句子**'),
    renderedBoldAlignment: rendered.includes('<strong>整句加粗</strong>') && rendered.includes('段内包含 <strong>局部加粗</strong> 内容') && rendered.includes('<strong>跨行 加粗句子</strong>'),
    importedMultilineBold: importedStrong.content.includes('\\\\textbf{跨行加粗第一部分 第二部分}') && strongRoundtrip.includes('　　**跨行加粗第一部分 第二部分**'),
  };
})()`);
assert(Object.entries(zhihuArticleFormatting).filter(([key]) => !key.endsWith('Snippet')).every(([, value]) => value), `知乎长文段落、列表或公式边界失败：${JSON.stringify(zhihuArticleFormatting)}`);

let realMarkdownRoundtrip = null;
if (process.env.FOLIO_SAMPLE_MD) {
  const sample = await readFile(process.env.FOLIO_SAMPLE_MD, 'utf8');
  realMarkdownRoundtrip = await evaluate(`(() => {
    const original = ${JSON.stringify(sample)};
    const originalMathBlocks = [...original.matchAll(/^\\s*\\$\\$\\s*$\\n([\\s\\S]*?)^\\s*\\$\\$\\s*$/gm)].length;
    const imported = smartMarkdownToLatex(original, 'Markdown 实文回归');
    const exported = latexToZhihuMarkdown(imported.content);
    const displayMath = [...exported.matchAll(/^\\$\\$\\s*$\\n([\\s\\S]*?)^\\$\\$\\s*$/gm)].map(match => match[1]);
    const displayMathErrors = displayMath.map((math, index) => {
      try { katex.renderToString(math, { displayMode: true, throwOnError: true }); return null; }
      catch (error) { return { index, message: error.message, math: math.slice(0, 240) }; }
    }).filter(Boolean);
    const proseOnly = exported.replace(/^\\$\\$\\s*$\\n[\\s\\S]*?^\\$\\$\\s*$/gm, '');
    const inlineMath = [...proseOnly.matchAll(/(?<!\\\\)\\$((?:\\\\.|[^$\\n])*)(?<!\\\\)\\$/g)].map(match => match[1]);
    const inlineMathErrors = inlineMath.map((math, index) => {
      try { katex.renderToString(math, { displayMode: false, throwOnError: true }); return null; }
      catch (error) { return { index, message: error.message, math: math.slice(0, 240) }; }
    }).filter(Boolean);
    const importedMathBlocks = (imported.content.match(/^\\\\\\[$/gm) || []).length;
    const exportedMathFences = (exported.match(/^\\$\\$$/gm) || []).length;
    return {
      originalMathBlocks,
      importedMathBlocks,
      exportedMathBlocks: exportedMathFences / 2,
      repairedLegacyFormulaBlocks: importedMathBlocks - originalMathBlocks,
      balancedFences: exportedMathFences % 2 === 0,
      indentedParagraphs: exported.split('\\n').filter(line => line.startsWith('　　')).length,
      bulletLines: exported.split('\\n').filter(line => /^\\s*[-+] /.test(line)).length,
      unmatchedInlineMathLines: exported.split('\\n').filter(line => escapeUnmatchedInlineMathDollar(line) !== line).length,
      orphanStrongMarkerLines: exported.split('\\n').filter(line => line.trim() === '**' || line.trim() === '__').length,
      terminalBoldRendered: window.marked.parse(exported, { gfm: true }).includes('<strong>Compression can be evidence that a model has discovered structure, but compression itself is not a definition of intelligence.</strong>'),
      displayMathErrors,
      inlineMathErrors,
    };
  })()`);
  if (process.env.FOLIO_OUTPUT_MD) {
    const exported = await evaluate(`(() => {
      const imported = smartMarkdownToLatex(${JSON.stringify(sample)}, 'Markdown 实文回归');
      return normalizeZhihuMarkdown('# ' + latexInlineToMarkdown(imported.title) + '\\n\\n' + latexToZhihuMarkdown(imported.content)) + '\\n';
    })()`);
    await writeFile(process.env.FOLIO_OUTPUT_MD, exported, 'utf8');
  }
  assert(realMarkdownRoundtrip.importedMathBlocks >= realMarkdownRoundtrip.originalMathBlocks
    && realMarkdownRoundtrip.importedMathBlocks === realMarkdownRoundtrip.exportedMathBlocks
    && realMarkdownRoundtrip.balancedFences
    && realMarkdownRoundtrip.displayMathErrors.length === 0
    && realMarkdownRoundtrip.inlineMathErrors.length === 0
    && realMarkdownRoundtrip.unmatchedInlineMathLines === 0
    && realMarkdownRoundtrip.orphanStrongMarkerLines === 0
    && realMarkdownRoundtrip.terminalBoldRendered
    && realMarkdownRoundtrip.indentedParagraphs > 100,
  `真实 Markdown 往返损坏：${JSON.stringify(realMarkdownRoundtrip)}`);
}

const headingSource = String.raw`\documentclass{article}
\begin{document}
\section
  [目录短标题]
  {一级 \textbf{完整标题}} \\
第一段第一行\\
第二行
\subsection*{二级无编号标题}
\subsubsection{三级标题}
\paragraph{四级标题}
\subparagraph{五级标题}
\begin{verbatim}
# 代码里的井号不是标题
\end{verbatim}
\end{document}`;
const headingStructure = await evaluate(`(() => {
  titleInput.value = '文章总标题';
  editor.value = ${JSON.stringify(headingSource)};
  const markdown = zhihuMarkdownDocument();
  const headingTokens = window.marked.lexer(markdown, { gfm: true }).filter(token => token.type === 'heading');
  const lines = markdown.trimEnd().split('\\n');
  const headingLines = []; let inFence = false;
  lines.forEach((line, index) => { if (line.startsWith(String.fromCharCode(96).repeat(3)) || /^~{3,}/.test(line)) { inFence = !inFence; return; } if (!inFence && /^#{1,6} /.test(line)) headingLines.push({ line, index }); });
  const aligned = headingLines.every(({ index }) => (index === 0 || lines[index - 1] === '') && (index === lines.length - 1 || lines[index + 1] === ''));
  const converted = markdownToLatex(markdown);
  const roundtrip = normalizeZhihuMarkdown('# ' + latexInlineToMarkdown(converted.title) + '\\n\\n' + latexToZhihuMarkdown(converted.content));
  const roundtripDepths = window.marked.lexer(roundtrip, { gfm: true }).filter(token => token.type === 'heading').map(token => token.depth);
  return {
    depths: headingTokens.map(token => token.depth),
    texts: headingTokens.map(token => token.text),
    aligned,
    fullTitle: markdown.includes('## 一级 **完整标题**') && !markdown.includes('目录短标题'),
    hardBreak: markdown.includes('第一段第一行  \\n第二行'),
    codeSafe: headingTokens.length === 6 && markdown.includes('# 代码里的井号不是标题'),
    noRawHeadingCommands: !/\\\\(?:section|subsection|subsubsection|paragraph|subparagraph)\\b/.test(markdown),
    roundtripDepths,
  };
})()`);
assert(JSON.stringify(headingStructure.depths) === JSON.stringify([1, 2, 3, 4, 5, 6])
  && JSON.stringify(headingStructure.roundtripDepths) === JSON.stringify([1, 2, 3, 4, 5, 6])
  && headingStructure.aligned
  && headingStructure.fullTitle
  && headingStructure.hardBreak
  && headingStructure.codeSafe
  && headingStructure.noRawHeadingCommands, `知乎 Markdown 标题结构失真：${JSON.stringify(headingStructure)}`);

const layout = await evaluate(`(() => {
  const input = document.querySelector('#editor');
  const sections = Array.from({ length: 80 }, (_, index) => String.raw\`\\section{第 \${index + 1} 节}
这是用于验证分页的长段落。浏览器应当把完整预览排成多张 A4 页面，而不是裁切到第一页。\`).join('\\n\\n');
  input.value = String.raw\`\\documentclass{article}
\\begin{document}
\\title{多页 PDF 回归测试}
\\maketitle
\` + sections + String.raw\`
\\end{document}\`;
  update(false);
  preparePrint();
  return { scrollHeight: document.querySelector('#preview').scrollHeight };
})()`);
assert(layout.scrollHeight > 3000, `长文档预览高度异常：${JSON.stringify(layout)}`);

const pdf = await command('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: true,
});
const pdfText = Buffer.from(pdf.data, 'base64').toString('latin1');
const pageCounts = [...pdfText.matchAll(/\/Count\s+(\d+)/g)].map(match => Number(match[1]));
const pageCount = Math.max(0, ...pageCounts);
assert(pageCount > 1, `PDF 仍然只有 ${pageCount || '未知'} 页。`);

console.log(JSON.stringify({ boot, filenames, toolbar, previewHeadingAndStats, linkedFolder, history, zhihu, fidelity, zhihuArticleFormatting, realMarkdownRoundtrip, headingStructure, pdfPages: pageCount }, null, 2));
socket.close();
