const endpoint = process.env.FOLIO_CDP || 'http://127.0.0.1:9223';
const pages = await fetch(`${endpoint}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.includes('127.0.0.1:4173'));
if (!page) throw new Error('没有找到 Folio 性能测试页面。');

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
  const request = pending.get(message.id);
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
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

const metrics = await evaluate(`(async () => {
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const sections = Array.from({ length: 600 }, (_, index) => {
    const formula = index % 3 === 0 ? '\\[\\sum_{i=1}^{n} x_i^2 = ' + index + '\\]' : '';
    return '\\section{性能测试 ' + index + '}\\n这是一个用于测量长文档输入响应的段落，包含英文 identifier\\_value 与中文内容。\\n\\n' +
      '第二段继续增加文档长度，并验证没有修改的段落是否会被重复排版。' + formula;
  }).join('\\n\\n');
  const input = document.querySelector('#editor');
  input.value = '\\documentclass{article}\\n\\begin{document}\\n' + sections + '\\n\\end{document}';

  const measurements = { compile: [], sourceMap: [], input: [], longTasks: [] };
  const originalCompile = compile;
  const originalSourceMap = buildSourceMap;
  compile = (...args) => { const start = performance.now(); const result = originalCompile(...args); measurements.compile.push(performance.now() - start); return result; };
  buildSourceMap = (...args) => { const start = performance.now(); const result = originalSourceMap(...args); measurements.sourceMap.push(performance.now() - start); return result; };
  const observer = typeof PerformanceObserver === 'function' ? new PerformanceObserver(list => measurements.longTasks.push(...list.getEntries().map(entry => entry.duration))) : null;
  try { observer?.observe({ type: 'longtask' }); } catch {}

  update(false);
  await wait(1800);
  const retainedPreviewNode = document.querySelector('#preview h2');
  measurements.compile.length = 0;
  measurements.sourceMap.length = 0;
  measurements.longTasks.length = 0;
  const wallStart = performance.now();
  for (let index = 0; index < 8; index++) {
    const position = input.value.lastIndexOf('\\\\end{document}');
    input.setSelectionRange(position, position);
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: '字' }));
    input.setRangeText('字', position, position, 'end');
    const start = performance.now();
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '字' }));
    measurements.input.push(performance.now() - start);
    await wait(220);
  }
  await wait(1800);
  observer?.disconnect();
  const summarize = values => ({ count: values.length, total: values.reduce((sum, value) => sum + value, 0), max: Math.max(0, ...values) });
  const backgroundSourceMap = summarize(measurements.sourceMap);
  const sourceMapStart = performance.now();
  const sourceMapReady = ensureSourceMap();
  const onDemandSourceMap = performance.now() - sourceMapStart;
  compile = originalCompile;
  buildSourceMap = originalSourceMap;
  return {
    sourceCharacters: input.value.length,
    sourceLines: input.value.split('\\n').length,
    wallTime: performance.now() - wallStart,
    compile: summarize(measurements.compile),
    sourceMap: backgroundSourceMap,
    onDemandSourceMap: { ready: sourceMapReady, duration: onDemandSourceMap },
    input: summarize(measurements.input),
    longTasks: summarize(measurements.longTasks),
    previewNodes: document.querySelector('#preview').querySelectorAll('*').length,
    retainedUnchangedNode: retainedPreviewNode === document.querySelector('#preview h2'),
  };
})()`);

console.log(JSON.stringify(metrics, null, 2));
socket.close();
const regressions = [
  [metrics.input.max > 20, `单次输入处理耗时过高：${metrics.input.max.toFixed(1)} ms`],
  [metrics.compile.count > 2, `连续输入触发了 ${metrics.compile.count} 次全量编译`],
  [metrics.sourceMap.count !== 0, '长文档编辑期间仍在后台重建定位索引'],
  [!metrics.onDemandSourceMap.ready, '按需双向定位索引建立失败'],
  [!metrics.retainedUnchangedNode, '预览更新替换了未变化的 DOM 块'],
].filter(([failed]) => failed).map(([, message]) => message);
if (regressions.length) throw new Error(`性能回归：${regressions.join('；')}`);
