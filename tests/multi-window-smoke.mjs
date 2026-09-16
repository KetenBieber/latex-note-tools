const endpoint = process.env.FOLIO_CDP || 'http://127.0.0.1:9224';
const appUrl = process.env.FOLIO_URL || 'http://127.0.0.1:4173/';

class CdpPage {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  command(method, params = {}) {
    const id = ++this.sequence;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() { this.socket.close(); }
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const page = new CdpPage(socket);
  await page.command('Runtime.enable');
  await page.command('Page.enable');
  return page;
}

async function waitUntilReady(page) {
  const result = await page.evaluate(`(async () => {
    const started=performance.now();
    while ((typeof editorSessionId==='undefined'||!document.querySelector('#preview')?.children.length) && performance.now()-started<4000) await new Promise(resolve=>setTimeout(resolve,40));
    await new Promise(resolve=>setTimeout(resolve,180));
    return {sessionId:editorSessionId,ready:!!document.querySelector('#preview')?.children.length};
  })()`);
  if (!result.ready) throw new Error('Folio 页面未能正常启动');
  return result;
}

async function reload(page) {
  const loaded = new Promise(resolve => {
    const listener = event => {
      if (JSON.parse(event.data).method !== 'Page.loadEventFired') return;
      page.socket.removeEventListener('message', listener);
      resolve();
    };
    page.socket.addEventListener('message', listener);
  });
  await page.command('Page.reload', { ignoreCache: true });
  await loaded;
  return waitUntilReady(page);
}

async function saveFixture(page, name, marker, imageMarker) {
  return page.evaluate(`(async () => {
    titleInput.value=${JSON.stringify(name)};
    editor.value=String.raw\`\\documentclass{article}\n\\begin{document}\n${marker}\n\\end{document}\`;
    replaceProjectImages({[${JSON.stringify(`${imageMarker}.png`)}]:${JSON.stringify(`data:image/png;base64,${imageMarker}`)}});
    update();
    persist();
    await saveRecoveryDraft();
    return {sessionId:editorSessionId,storageKey,recoveryDraftKey,recoveryImagesKey};
  })()`);
}

const targets = await fetch(`${endpoint}/json/list`).then(response => response.json());
const firstTarget = targets.find(target => target.type === 'page' && target.url.startsWith(appUrl));
if (!firstTarget) throw new Error('没有找到 Folio 测试页面');
const first = await connect(firstTarget);
await waitUntilReady(first);

const created = await first.command('Target.createTarget', { url: appUrl });
let secondTarget;
for (let attempt = 0; attempt < 30 && !secondTarget; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 50));
  const current = await fetch(`${endpoint}/json/list`).then(response => response.json());
  secondTarget = current.find(target => target.id === created.targetId);
}
if (!secondTarget) throw new Error('无法创建第二个测试标签页');
const second = await connect(secondTarget);
await waitUntilReady(second);

const firstInitialSession = await first.evaluate('editorSessionId');
await second.evaluate(`sessionStorage.setItem(editorSessionSlot, ${JSON.stringify(firstInitialSession)})`);
const collisionResult = await reload(second);
if (collisionResult.sessionId === firstInitialSession) throw new Error('复制标签页的会话冲突没有自动分叉');

const firstSaved = await saveFixture(first, '窗口 A 笔记', 'ONLY_WINDOW_A', 'AAAA');
const secondSaved = await saveFixture(second, '窗口 B 笔记', 'ONLY_WINDOW_B', 'BBBB');
if (firstSaved.sessionId === secondSaved.sessionId) throw new Error('两个标签页仍在共用同一恢复会话');

const firstReloaded = await reload(first);
const secondReloaded = await reload(second);
const firstState = await first.evaluate(`({title:titleInput.value,tabTitle:document.title,content:editor.value,images:Object.keys(projectImages),sessionId:editorSessionId})`);
const secondState = await second.evaluate(`({title:titleInput.value,tabTitle:document.title,content:editor.value,images:Object.keys(projectImages),sessionId:editorSessionId})`);

const valid = firstReloaded.sessionId === firstSaved.sessionId
  && secondReloaded.sessionId === secondSaved.sessionId
  && firstState.title === '窗口 A 笔记'
  && secondState.title === '窗口 B 笔记'
  && firstState.tabTitle.startsWith('窗口 A 笔记')
  && secondState.tabTitle.startsWith('窗口 B 笔记')
  && firstState.content.includes('ONLY_WINDOW_A')
  && !firstState.content.includes('ONLY_WINDOW_B')
  && secondState.content.includes('ONLY_WINDOW_B')
  && !secondState.content.includes('ONLY_WINDOW_A')
  && firstState.images.join(',') === 'AAAA.png'
  && secondState.images.join(',') === 'BBBB.png';
if (!valid) throw new Error(`多窗口恢复隔离失败：${JSON.stringify({firstSaved,secondSaved,firstState,secondState})}`);

console.log(JSON.stringify({
  isolatedSessions: true,
  duplicateTabForked: true,
  first: firstState,
  second: secondState,
}, null, 2));

await first.command('Target.closeTarget', { targetId: created.targetId });
first.close();
second.close();
