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

const boot = await evaluate(`({ ready: document.readyState, update: typeof update, preview: !!document.querySelector('#preview')?.children.length })`);
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

console.log(JSON.stringify({ boot, toolbar, zhihu, pdfPages: pageCount }, null, 2));
socket.close();
