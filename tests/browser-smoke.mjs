const endpoint = process.env.FOLIO_CDP || 'http://127.0.0.1:9222';
const pages = await fetch(`${endpoint}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.includes('127.0.0.1:4173'));
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
  return { highlighted, colored, list, code };
})()`);
assert(Object.values(toolbar).every(Boolean), `工具栏插入失败：${JSON.stringify(toolbar)}`);

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

console.log(JSON.stringify({ boot, toolbar, history, zhihu, fidelity, pdfPages: pageCount }, null, 2));
socket.close();
