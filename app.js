const $ = (selector) => document.querySelector(selector);
const editor = $('#editor');
const preview = $('#preview');
const previewStage = $('.paper-stage');
const titleInput = $('#documentTitle');
const legacyStorageKey = 'folio-latex-document-v1';
const editorSessionSlot = 'folio-latex-editor-session-v1';
const lastEditorSessionSlot = 'folio-latex-last-session-v2';
const newEditorSessionId = () => crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let editorSessionId;
try { editorSessionId=sessionStorage.getItem(editorSessionSlot)||newEditorSessionId();sessionStorage.setItem(editorSessionSlot,editorSessionId); }
catch { editorSessionId=newEditorSessionId(); }
let storageKey=`folio-latex-document-v2:${editorSessionId}`;
let recoveryDraftKey=`draft:${editorSessionId}`,recoveryImagesKey=`project-images:${editorSessionId}`;
const editorWindowId=newEditorSessionId();
let editorSessionCollision=false,editorSessionChannel=null;
function setEditorSessionId(id){editorSessionId=id;storageKey=`folio-latex-document-v2:${id}`;recoveryDraftKey=`draft:${id}`;recoveryImagesKey=`project-images:${id}`;try{sessionStorage.setItem(editorSessionSlot,id);}catch{}}
try {
  editorSessionChannel=new BroadcastChannel('folio-latex-editor-sessions-v1');
  editorSessionChannel.addEventListener('message',event=>{const message=event.data||{};if(message.type==='probe'&&message.sessionId===editorSessionId&&message.windowId!==editorWindowId)editorSessionChannel.postMessage({type:'claimed',sessionId:editorSessionId,target:message.windowId,windowId:editorWindowId});else if(message.type==='claimed'&&message.target===editorWindowId&&message.sessionId===editorSessionId)editorSessionCollision=true;});
} catch {/* 不支持 BroadcastChannel 时仍由 sessionStorage 隔离普通标签页 */}
async function ensureUniqueEditorSession(){if(!editorSessionChannel)return;editorSessionCollision=false;editorSessionChannel.postMessage({type:'probe',sessionId:editorSessionId,windowId:editorWindowId});await new Promise(resolve=>setTimeout(resolve,90));if(editorSessionCollision)setEditorSessionId(newEditorSessionId());}
const defaultDocument = String.raw`\documentclass[11pt,a4paper]{ctexart}
\usepackage{amsmath,amssymb,amsthm,mathtools}
\usepackage[most]{tcolorbox}
\usepackage{graphicx,float,booktabs,tabularx}
\usepackage{enumitem,fancyhdr,hyperref,microtype}
\usepackage[margin=2.4cm]{geometry}
\setcounter{secnumdepth}{5}
\setcounter{tocdepth}{5}

\definecolor{cmublue}{HTML}{1F5A94}
\definecolor{cmured}{HTML}{A33A3A}
\definecolor{cmugreen}{HTML}{39734D}
\definecolor{cmuorange}{HTML}{B26322}
\definecolor{cmupurple}{HTML}{684B8E}
\newtcolorbox{defbox}[1][]{enhanced,breakable,colback=cmublue!5,colframe=cmublue,title={定义：#1},fonttitle=\bfseries}
\newtcolorbox{thmbox}[1][]{enhanced,breakable,colback=cmured!5,colframe=cmured,title={定理：#1},fonttitle=\bfseries}
\newtcolorbox{exbox}[1][]{enhanced,breakable,colback=cmugreen!5,colframe=cmugreen,title={例题：#1},fonttitle=\bfseries}
\newtcolorbox{whybox}[1][]{enhanced,breakable,colback=cmuorange!6,colframe=cmuorange,title={直觉：#1},fonttitle=\bfseries}
\newtcolorbox{sumbox}[1][]{enhanced,breakable,colback=cmupurple!5,colframe=cmupurple,title={本节总结},fonttitle=\bfseries}

\title{课程名称：第一讲}
\author{你的名字}
\date{\today}
\pagestyle{fancy}
\lhead{COURSE-CODE \quad Lecture 01}
\rhead{\today}
\cfoot{\thepage}

\begin{document}
\maketitle
\tableofcontents
\newpage

\section{本讲主题}
先用一句话说明为什么这个主题值得学习。

\begin{defbox}[核心概念]
清晰、完整地写出定义，并解释符号的含义。
\end{defbox}

\begin{thmbox}[主要结论]
对任意 $x \in \mathbb{R}$，在这里陈述主要结论。
\end{thmbox}

\begin{proof}
先用一句话说明证明策略，然后写出推导过程。
\[
  e^{i\pi}+1=0.
\]
\end{proof}

\begin{whybox}
用两三句话解释证明背后的核心直觉。
\end{whybox}

\begin{exbox}[应用示例]
给出一个具体例子，并逐步展示计算过程。
\end{exbox}

\begin{sumbox}
\begin{itemize}
  \item 本节最重要的概念；
  \item 需要记住的结论；
  \item 仍待解决的问题。
\end{itemize}
\end{sumbox}

\end{document}`;

let saveTimer, saveIdle, renderTimer, renderIdle, sourceMapTimer, sourceMapIdle, zoom = 1;
let projectImages = {};
let projectImagesRevision = 0, savedImagesRevision = -1;
let editorHistory = [], editorHistoryIndex = -1, applyingEditorHistory = false;
let lastHistoryInputAt = 0, lastHistoryInputType = '', historyTimer, historyBurstStartedAt = 0, pendingHistoryInputType = '';
let previewTextCache = new WeakMap();
let renderedLineCount = 0;
let editorRevision = 0, previewRevision = -1, mappedRevision = -1;
let previewBlockKeys = [], lastRenderedSource = '', lastRenderedImageRevision = -1, renderBackendRevision = 0, lastRenderedBackendRevision = -1;
const mathRenderCache = new Map(), inlineRenderCache = new Map();
const templates = [
  { id:'daily', icon:'☀', name:'每日笔记', description:'今日重点、灵感、任务与复盘', content:String.raw`\documentclass{article}
\setcounter{secnumdepth}{5}
\setcounter{tocdepth}{5}
\title{每日笔记 · \today}
\author{}
\begin{document}
\maketitle
\section{今日重点}
\begin{itemize}
  \item 今天最重要的一件事
  \item 需要跟进的事项
\end{itemize}
\section{想法与记录}
在这里写下你的想法。
\section{今日复盘}
今天有什么收获？明天可以改善什么？
\end{document}` },
  { id:'course', icon:'§', name:'课程笔记', description:'概念、公式、例题和课后问题', content:String.raw`\documentclass{article}
\usepackage{amsmath, amsthm, graphicx}
\setcounter{secnumdepth}{5}
\setcounter{tocdepth}{5}
\title{课程名称 · 第 1 讲}
\author{你的名字}
\begin{document}
\maketitle
\section{本讲主题}
用一两句话总结本节课。
\section{核心概念}
\begin{itemize}
  \item 概念一：解释
  \item 概念二：解释
\end{itemize}
\section{关键公式}
\[
  f(x) = x^2
\]
\section{例题与推导}
写下题目、思路和详细推导。
\section{待解决问题}
\begin{enumerate}
  \item 还有什么不理解？
\end{enumerate}
\end{document}` },
  { id:'research', icon:'∑', name:'论文阅读', description:'问题、方法、实验与个人评价', content:String.raw`\documentclass{article}
\usepackage{amsmath, graphicx}
\setcounter{secnumdepth}{5}
\setcounter{tocdepth}{5}
\title{论文阅读笔记}
\author{论文作者 · 年份}
\begin{document}
\maketitle
\begin{abstract}
用三句话概括论文解决的问题、方法和结论。
\end{abstract}
\section{研究问题}
作者为什么研究这个问题？
\section{核心方法}
\begin{itemize}
  \item 方法的主要步骤
  \item 相比已有工作的区别
\end{itemize}
\section{实验与结果}
点击工具栏中的“图片”插入论文图表。
\section{优点与局限}
\textbf{优点：} 

\textbf{局限：} 
\section{我的启发}
这个工作对自己的研究有什么帮助？
\end{document}` }
];
const escapeHtml = (value) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const toast = (message) => { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('show'),2200); };
function documentFilename(extension=''){const base=(titleInput.value.trim()||'无题笔记').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').slice(0,160)||'无题笔记',suffix=extension.replace(/^\./,'');return suffix?`${base}.${suffix}`:base;}
function updateWindowTitle(){const value=`${titleInput.value.trim()||'无题笔记'} — Folio`;if(document.title!==value)document.title=value;}
function currentEditorSnapshot(){return {value:editor.value,start:editor.selectionStart,end:editor.selectionEnd,scrollTop:editor.scrollTop};}
function updateEditorHistorySelection(){if(applyingEditorHistory||historyTimer)return;const current=editorHistory[editorHistoryIndex];if(!current)return;current.start=editor.selectionStart;current.end=editor.selectionEnd;current.scrollTop=editor.scrollTop;}
function recordEditorHistory(options={}){if(applyingEditorHistory)return;clearTimeout(historyTimer);historyTimer=null;historyBurstStartedAt=0;const snapshot=currentEditorSnapshot(),current=editorHistory[editorHistoryIndex],now=performance.now(),coalesce=options.coalesce&&editorHistoryIndex>0&&options.inputType===lastHistoryInputType&&now-lastHistoryInputAt<750;if(current?.value===snapshot.value){updateEditorHistorySelection();return;}if(coalesce){editorHistory[editorHistoryIndex]=snapshot;}else{editorHistory=editorHistory.slice(0,editorHistoryIndex+1);editorHistory.push(snapshot);const maxEntries=Math.max(20,Math.min(120,Math.floor(8_000_000/Math.max(1,snapshot.value.length))));while(editorHistory.length>maxEntries)editorHistory.shift();editorHistoryIndex=editorHistory.length-1;}lastHistoryInputAt=options.coalesce?now:0;lastHistoryInputType=options.coalesce?options.inputType:'';}
function flushEditorHistory(){if(!historyTimer)return;clearTimeout(historyTimer);historyTimer=null;recordEditorHistory({coalesce:true,inputType:pendingHistoryInputType||'input'});}
function scheduleEditorHistory(inputType){const now=performance.now();if(!historyBurstStartedAt)historyBurstStartedAt=now;pendingHistoryInputType=inputType||'input';clearTimeout(historyTimer);const delay=Math.max(0,Math.min(420,1600-(now-historyBurstStartedAt)));historyTimer=setTimeout(flushEditorHistory,delay);}
function resetEditorHistory(){clearTimeout(historyTimer);historyTimer=null;historyBurstStartedAt=0;editorHistory=[currentEditorSnapshot()];editorHistoryIndex=0;lastHistoryInputAt=0;lastHistoryInputType='';}
function replaceProjectImages(images){projectImages=images;projectImagesRevision++;}
function markProjectImagesChanged(){projectImagesRevision++;}
function applyEditorHistory(index){const snapshot=editorHistory[index];if(!snapshot)return false;applyingEditorHistory=true;editorHistoryIndex=index;editor.value=snapshot.value;editor.setSelectionRange(snapshot.start,snapshot.end);editor.scrollTop=snapshot.scrollTop;update();applyingEditorHistory=false;editor.focus({preventScroll:true});return true;}
function undoEditor(){flushEditorHistory();if(!applyEditorHistory(editorHistoryIndex-1))return toast('没有更早的修改');toast('已撤销');}
function redoEditor(){flushEditorHistory();if(!applyEditorHistory(editorHistoryIndex+1))return toast('没有可重做的修改');toast('已重做');}

function loadDocument() {
  let saved=null,fromSession=false,fallbackSessionId=null;
  try { const sessionValue=localStorage.getItem(storageKey),lastSessionId=localStorage.getItem(lastEditorSessionSlot),fallbackValue=!sessionValue&&lastSessionId&&lastSessionId!==editorSessionId?localStorage.getItem(`folio-latex-document-v2:${lastSessionId}`):null;fromSession=Boolean(sessionValue);fallbackSessionId=fallbackValue?lastSessionId:null;saved=JSON.parse(sessionValue||fallbackValue||localStorage.getItem(legacyStorageKey));editor.value=saved?.content || defaultDocument;titleInput.value=saved?.name || '我的第一份 LaTeX 笔记'; }
  catch { editor.value=defaultDocument; }
  update();
  return {draft:saved,fromSession,fallbackSessionId};
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({name:titleInput.value,content:editor.value,updatedAt:new Date().toISOString()}));localStorage.setItem(lastEditorSessionSlot,editorSessionId); } catch {/* IndexedDB 恢复草稿仍然可用 */}
  $('#saveStatus').innerHTML='<i></i> 已保存';
}
function openRecoveryDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('folio-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function saveRecoveryDraft(){try{const db=await openRecoveryDb(),imageRevision=projectImagesRevision,writeImages=savedImagesRevision!==imageRevision;await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');store.put({name:titleInput.value,content:editor.value,updatedAt:Date.now()},recoveryDraftKey);if(writeImages)store.put({images:projectImages,updatedAt:Date.now()},recoveryImagesKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});if(writeImages&&projectImagesRevision===imageRevision)savedImagesRevision=imageRevision;db.close();}catch{/* localStorage 文字草稿仍然可用 */}}
async function loadRecoveryDraft(localState=null){try{const localDraft=localState?.draft??localState,db=await openRecoveryDb(),readKeys=async(draftKey,imageKey)=>{const tx=db.transaction('drafts'),store=tx.objectStore('drafts'),read=key=>new Promise((resolve,reject)=>{const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return Promise.all([read(draftKey),read(imageKey)]);};let [draft,imageDraft]=await readKeys(recoveryDraftKey,recoveryImagesKey),foreignRecovery=false;if(!draft&&!imageDraft&&localState?.fallbackSessionId){[draft,imageDraft]=await readKeys(`draft:${localState.fallbackSessionId}`,`project-images:${localState.fallbackSessionId}`);foreignRecovery=true;}else if(!draft&&!imageDraft&&!localState?.fromSession){[draft,imageDraft]=await readKeys('current','project-images');foreignRecovery=true;}db.close();const localUpdated=Date.parse(localDraft?.updatedAt)||0,draftUpdated=Number(draft?.updatedAt)||0;if(draft?.content&&(!localDraft?.content||draftUpdated>localUpdated)){editor.value=draft.content;titleInput.value=draft.name||titleInput.value;}if(imageDraft?.images||draft?.images){projectImages=imageDraft?.images||draft.images||{};projectImagesRevision=0;savedImagesRevision=imageDraft&&!foreignRecovery?0:-1;}if(draft?.content||imageDraft?.images||draft?.images)update();}catch{/* 使用 localStorage 降级 */}}
function cancelScheduledSave(){clearTimeout(saveTimer);if(saveIdle&&'cancelIdleCallback' in window)cancelIdleCallback(saveIdle);saveIdle=null;}
function commitScheduledSave(){saveIdle=null;persist();saveRecoveryDraft();}
function scheduleSave(){ $('#saveStatus').innerHTML='<i style="background:#d49b43"></i> 待保存…';cancelScheduledSave();const delay=editor.value.length>50000?1400:750;saveTimer=setTimeout(()=>{if('requestIdleCallback' in window)saveIdle=requestIdleCallback(commitScheduledSave,{timeout:2500});else commitScheduledSave();},delay); }
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')return;cancelScheduledSave();flushEditorHistory();persist();saveRecoveryDraft();});
function cacheRender(cache,key,value,limit){if(cache.has(key))cache.delete(key);cache.set(key,value);while(cache.size>limit)cache.delete(cache.keys().next().value);return value;}
function renderMath(tex, displayMode=false) {
  if (!window.katex) return `<span>${escapeHtml(tex)}</span>`;
  const key=`${displayMode?'D':'I'}:${tex}`,cached=mathRenderCache.get(key);if(cached!==undefined){mathRenderCache.delete(key);mathRenderCache.set(key,cached);return cached;}
  try { return cacheRender(mathRenderCache,key,window.katex.renderToString(tex,{displayMode,throwOnError:true,strict:false,trust:false}),800); }
  catch (e) { return cacheRender(mathRenderCache,key,`<span class="render-error" title="${escapeHtml(e.message)}">${escapeHtml(tex)}</span>`,800); }
}
function latexColorCss(name,fallback='#fff26b'){const colors={red:'#c62828',blue:'#2457c5','green!55!black':'#26733c',violet:'#7046a3',gray:'#666','yellow!45':'#fff09a','lime!30':'#dff3ad','cyan!25':'#c8eef2','magenta!20':'#f3d1e8'};return colors[name]||fallback;}
function inline(text) {
  const cacheable=text.length<=5000,cached=cacheable?inlineRenderCache.get(text):undefined;if(cached!==undefined){inlineRenderCache.delete(text);inlineRenderCache.set(text,cached);return cached;}
  let safe=escapeHtml(text);
  const unescapeLatex=value=>value.replace(/\\([_%&#$])/g,'$1').replace(/\\textasciitilde\{\}/g,'~').replace(/\\textasciicircum\{\}/g,'^');
  safe=safe.replace(/\\colorbox\{([^{}]+)\}\{([^{}]*)\}/g,(_,color,x)=>`<mark class="latex-highlight" style="background:${latexColorCss(color,'#fff09a')}">${x.replace(/^\\strut\s*/, '')}</mark>`)
    .replace(/\\textcolor\{([^{}]+)\}\{([^{}]*)\}/g,(_,color,x)=>`<span style="color:${latexColorCss(color,'inherit')}">${x}</span>`)
    .replace(/\\texttt\{([^{}]*)\}/g,(_,x)=>`<code class="inline-code">${unescapeLatex(x)}</code>`)
    .replace(/\\textbf\{([^{}]*)\}/g,'<strong>$1</strong>')
    .replace(/\\(?:textit|emph)\{([^{}]*)\}/g,'<em>$1</em>')
    .replace(/\\underline\{([^{}]*)\}/g,'<u>$1</u>')
    .replace(/\\sout\{([^{}]*)\}/g,'<s>$1</s>')
    .replace(/\\url\{([^{}]+)\}/g,'<a href="$1" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\\footnote\{([^{}]*)\}/g,'<sup class="footnote" title="$1">注</sup>');
  safe=safe.replace(/\$([^$\n]+)\$/g,(_,m)=>renderMath(m,false));
  safe=safe.replace(/\\href\{([^{}]+)\}\{([^{}]+)\}/g,'<a href="$1" target="_blank" rel="noreferrer">$2</a>');
  safe=safe.replace(/\\(LaTeX|TeX)\b/g,'<span class="latex-word">$1</span>').replace(/\\today\b/g,new Date().toLocaleDateString('zh-CN'));
  safe=safe.replace(/\\\\/g,'<br>');
  const output=unescapeLatex(safe);return cacheable?cacheRender(inlineRenderCache,text,output,3000):output;
}
function compile(source) {
  let body=source.replace(/^[\s\S]*?\\begin\{document\}/,'').replace(/\\end\{document\}[\s\S]*$/,'');
  const equationLabels=new Map(),referenceLabels=new Map();let equationCounter=0,equationStarCounter=0,tableCounter=0;
  const title=source.match(/\\title\{([^}]*)\}/)?.[1]; const author=source.match(/\\author\{([^}]*)\}/)?.[1];
  body=body.replace(/\\maketitle/g, title?`<h1>${inline(title)}</h1>${author?`<div class="author">${inline(author)}</div>`:''}`:'');
  body=body.replace(/\\tableofcontents\b/g,'@@FOLIOTOC@@').replace(/\\(?:newpage|clearpage|pagebreak)\b/g,'');
  body=body.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g,(_,x)=>`<div class="abstract">${inline(x.trim())}</div>`);
  body=body.replace(/\\begin\{(theorem|proof)\}([\s\S]*?)\\end\{\1\}/g,(_,type,x)=>`<div class="theorem"><strong>${type==='proof'?'证明':'定理'}.</strong> ${inline(x.trim())}</div>`);
  const boxNames={defbox:'定义',thmbox:'定理',exbox:'例题',whybox:'直觉',sumbox:'总结'};
  body=body.replace(/\\begin\{(defbox|thmbox|exbox|whybox|sumbox)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g,(_,type,label,x)=>`<div class="theorem cmu-box ${type}"><strong>${boxNames[type]}${label?`：${inline(label)}`:''}</strong><br>${inline(x.trim())}</div>`);
  body=body.replace(/\\begin\{(verbatim|lstlisting)\}([\s\S]*?)\\end\{\1\}/g,(_,__,x)=>`<pre>${escapeHtml(x.trim())}</pre>`);
  body=body.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g,(_,x)=>`<blockquote>${inline(x.trim())}</blockquote>`);
  body=body.replace(/\\begin\{equation(\*)?\}([\s\S]*?)\\end\{equation\1\}/g,(_,star,x)=>{const numbered=!star,number=numbered?++equationCounter:null,label=x.match(/\\label\{([^}]+)\}/)?.[1]||'',math=x.replace(/\\label\{[^}]+\}/g,'').trim(),serial=numbered?number:`star-${++equationStarCounter}`,id=label?`equation-${label.replace(/[^\w:-]+/g,'-')}`:`equation-${serial}`;if(label&&numbered){equationLabels.set(label,number);referenceLabels.set(label,number);}return `<div class="display-equation${numbered?'':' unnumbered'}" id="${escapeHtml(id)}"><span class="equation-math">${renderMath(math,true)}</span>${numbered?`<span class="equation-number">(${number})</span>`:''}</div>`;});
  body=body.replace(/\\eqref\{([^}]+)\}/g,(_,label)=>`(${equationLabels.get(label)??'?'})`);
  body=body.replace(/\\begin\{table\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{table\}/g,(_,table)=>{const content=table.match(/\\begin\{tabularx\}[^\r\n]*\r?\n([\s\S]*?)\\end\{tabularx\}/)?.[1]??table.match(/\\begin\{tabular\}[^\r\n]*\r?\n([\s\S]*?)\\end\{tabular\}/)?.[1];if(content==null)return '<div class="render-error">暂不支持此表格结构，源码会原样保留到正式编译。</div>';const number=++tableCounter,caption=table.match(/\\caption\{([^}]*)\}/)?.[1]||'',label=table.match(/\\label\{([^}]+)\}/)?.[1]||'',hasHeader=/\\midrule\b/.test(content),clean=content.replace(/\\(toprule|midrule|bottomrule|hline)\b/g,''),rows=clean.split(/\\\\/).map(row=>row.trim()).filter(Boolean),html=rows.map((row,i)=>`<tr>${row.split('&').map(cell=>`<${hasHeader&&i===0?'th':'td'}>${inline(cell.trim())}</${hasHeader&&i===0?'th':'td'}>`).join('')}</tr>`).join(''),id=label?`table-${label.replace(/[^\w:-]+/g,'-')}`:`table-${number}`;if(label)referenceLabels.set(label,number);return `<figure class="table-figure" id="${escapeHtml(id)}"><figcaption><span>表 ${number}</span>${caption?`　${inline(caption)}`:''}</figcaption><div class="table-scroll"><table>${html}</table></div></figure>`;});
  body=body.replace(/\\ref\{([^}]+)\}/g,(_,label)=>String(referenceLabels.get(label)??'?'));
  body=body.replace(/\\par\\medskip\\hrule\\medskip/g,'<hr>');
  body=body.replace(/\\begin\{figure\}(?:\[[^\]]*\])?/g,'').replace(/\\end\{figure\}/g,'').replace(/\\centering\b/g,'').replace(/\\label\{[^}]+\}/g,'');
  body=body.replace(/\\includegraphics(?:\[width=([^\]]+)\])?\{([^}]+)\}\s*(?:\\caption\{([^}]+)\})?/g,(_,width,name,caption)=>{const key=name.replace(/^images\//,'');const src=projectImages[key]||projectImages[name];const percent=width?.match(/([\d.]+)\\textwidth/)?.[1];if(!src)return `<div class="render-error">图片已写入项目：${escapeHtml(name)}（真实编译后显示）</div>`;return `<figure><img src="${src}" alt="${escapeHtml(caption||name)}" style="width:${percent?Number(percent)*100:100}%">${caption?`<figcaption>${inline(caption)}</figcaption>`:''}</figure>`;});
  body=body.replace(/\\\[([\s\S]*?)\\\]/g,(_,x)=>`<div class="display-math">${renderMath(x.trim(),true)}</div>`).replace(/\$\$([\s\S]*?)\$\$/g,(_,x)=>`<div class="display-math">${renderMath(x.trim(),true)}</div>`);
  const headingLevels={section:1,subsection:2,subsubsection:3,paragraph:4,subparagraph:5},headingCounts=[0,0,0,0,0],headings=[];let headingSerial=0;
  body=body.replace(/\\(section|subsection|subsubsection|paragraph|subparagraph)(\*)?\{([^}]*)\}(?:[ \t]*\\\\)?/g,(_,command,star,text)=>{const depth=headingLevels[command],tag=depth+1,id=`folio-heading-${++headingSerial}`;let number='';if(!star){headingCounts[depth-1]++;headingCounts.fill(0,depth);number=headingCounts.slice(0,depth).join('.');headings.push({depth,id,number,text});}return `<h${tag} id="${id}"${star?' class="unnumbered"':''}>${number?`<span class="heading-number">${number}</span>`:''}${inline(text)}</h${tag}>`;});
  const toc=headings.length?`<div class="note-toc"><strong>目录</strong><ol>${headings.map(item=>`<li class="toc-level-${item.depth}"><a href="#${item.id}"><span>${item.number}</span>${inline(item.text)}</a></li>`).join('')}</ol></div>`:'';
  body=body.replace(/@@FOLIOTOC@@/g,toc);
  body=body.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g,(_,type,x)=>{const tag=type==='enumerate'?'ol':'ul';const items=x.split(/\\item\s*/).filter(Boolean).map(i=>`<li>${inline(i.trim())}</li>`).join('');return `<${tag}>${items}</${tag}>`;});
  body=body.replace(/^\s*%.*$/gm,'').replace(/\\(documentclass|usepackage|date)(?:\[[^\]]*\])?\{[^}]*\}/g,'');
  const htmlBlocks=[],blockPattern=/<(h[1-6]|div|ul|ol|pre|figure|blockquote|table)\b[^>]*>|<hr\b[^>]*>/gi;let protectedBody='',bodyCursor=0,blockMatch;
  while((blockMatch=blockPattern.exec(body))){const start=blockMatch.index;protectedBody+=body.slice(bodyCursor,start);if(!blockMatch[1]){htmlBlocks.push(blockMatch[0]);protectedBody+=`@@FOLIOHTML${htmlBlocks.length-1}@@`;bodyCursor=blockPattern.lastIndex;continue;}const tag=blockMatch[1].toLowerCase(),tagPattern=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi');tagPattern.lastIndex=blockPattern.lastIndex;let depth=1,end=-1,tagMatch;while((tagMatch=tagPattern.exec(body))){depth+=tagMatch[0][1]==='/'?-1:1;if(depth===0){end=tagPattern.lastIndex;break;}}if(end<0){protectedBody+=blockMatch[0];bodyCursor=blockPattern.lastIndex;continue;}htmlBlocks.push(body.slice(start,end));protectedBody+=`@@FOLIOHTML${htmlBlocks.length-1}@@`;bodyCursor=end;blockPattern.lastIndex=end;}
  body=protectedBody+body.slice(bodyCursor);
  const restoreHtml=value=>value.replace(/@@FOLIOHTML(\d+)@@/g,(_,i)=>htmlBlocks[Number(i)]);
  return body.split(/\n\s*\n/).map(block=>block.trim().split(/(@@FOLIOHTML\d+@@)/g).map(part=>{if(!part)return '';if(/^@@FOLIOHTML\d+@@$/.test(part))return restoreHtml(part);const text=part.trim();return text?`<p>${inline(text).replace(/\n/g,'<br>')}</p>`:'';}).join('')).join('').replace(/<p>\s*<\/p>/g,'');
}
function setCompileStatus(value){const status=$('#compileStatus');if(status.textContent!==value)status.textContent=value;}
function sourceIsLong(source=editor.value){return source.length>45000||renderedLineCount>900;}
function cancelSourceMapBuild(){clearTimeout(sourceMapTimer);if(sourceMapIdle&&'cancelIdleCallback' in window)cancelIdleCallback(sourceMapIdle);sourceMapIdle=null;}
function scheduleSourceMapBuild(revisionAtRender,sourceLength=editor.value.length){cancelSourceMapBuild();if(sourceLength>45000||renderedLineCount>900){setCompileStatus('即时排版 · 定位按需建立');return;}const run=()=>{sourceMapIdle=null;if(editorRevision!==revisionAtRender||previewRevision!==revisionAtRender)return;buildSourceMap();mappedRevision=revisionAtRender;setCompileStatus('即时排版 · 双向定位');};if('requestIdleCallback' in window)sourceMapIdle=requestIdleCallback(run,{timeout:900});else sourceMapTimer=setTimeout(run,80);}
function previewNodeKey(node){const value=node.nodeType===Node.TEXT_NODE?`#${node.data}`:node.outerHTML;let hash=2166136261;for(let index=0;index<value.length;index++)hash=Math.imul(hash^value.charCodeAt(index),16777619);return `${value.length}:${hash>>>0}`;}
function applyPreviewHtml(html){const template=document.createElement('template');template.innerHTML=html;const nextNodes=[...template.content.childNodes],nextKeys=nextNodes.map(previewNodeKey),currentLength=previewBlockKeys.length,nextLength=nextKeys.length;if(currentLength!==preview.childNodes.length){preview.replaceChildren(template.content);previewBlockKeys=nextKeys;return;}let prefix=0;while(prefix<currentLength&&prefix<nextLength&&previewBlockKeys[prefix]===nextKeys[prefix])prefix++;let suffix=0;while(suffix<currentLength-prefix&&suffix<nextLength-prefix&&previewBlockKeys[currentLength-1-suffix]===nextKeys[nextLength-1-suffix])suffix++;if(prefix===currentLength&&prefix===nextLength){previewBlockKeys=nextKeys;return;}clearPreviewTextHighlights();preview.querySelectorAll('.source-sync-highlight').forEach(node=>node.classList.remove('source-sync-highlight'));const anchor=suffix?preview.childNodes[currentLength-suffix]:null,removeCount=currentLength-prefix-suffix;for(let index=0;index<removeCount;index++)preview.childNodes[prefix]?.remove();const fragment=document.createDocumentFragment();for(let index=prefix;index<nextLength-suffix;index++)fragment.append(nextNodes[index]);preview.insertBefore(fragment,anchor);previewBlockKeys=nextKeys;}
function cancelPreviewRender(){clearTimeout(renderTimer);if(renderIdle&&'cancelIdleCallback' in window)cancelIdleCallback(renderIdle);renderIdle=null;}
function commitPreviewRender(sourceAtRender,revisionAtRender,force=false){renderIdle=null;if(revisionAtRender!==editorRevision&&!force)return;const unchanged=sourceAtRender===lastRenderedSource&&lastRenderedImageRevision===projectImagesRevision&&lastRenderedBackendRevision===renderBackendRevision;if(unchanged&&!force){const mappingCurrent=mappedRevision===previewRevision;previewRevision=revisionAtRender;if(mappingCurrent)mappedRevision=revisionAtRender;setCompileStatus(mappingCurrent?'即时排版 · 双向定位':'即时排版 · 定位按需建立');return;}previewTextCache=new WeakMap();applyPreviewHtml(compile(sourceAtRender));lastRenderedSource=sourceAtRender;lastRenderedImageRevision=projectImagesRevision;lastRenderedBackendRevision=renderBackendRevision;previewRevision=revisionAtRender;mappedRevision=-1;setCompileStatus('即时排版 · 正在准备定位…');scheduleSourceMapBuild(revisionAtRender,sourceAtRender.length);}
function schedulePreviewRender(force=false){cancelPreviewRender();const sourceLength=editor.value.length,delay=Math.min(850,170+Math.floor(sourceLength/180));renderTimer=setTimeout(()=>{const sourceAtRender=editor.value,revisionAtRender=editorRevision,run=()=>commitPreviewRender(sourceAtRender,revisionAtRender,force);if('requestIdleCallback' in window)renderIdle=requestIdleCallback(run,{timeout:sourceLength>45000?1000:500});else run();},delay);}
function refreshLineNumbers(){let count=1,position=-1;while((position=editor.value.indexOf('\n',position+1))>=0)count++;if(count===renderedLineCount)return;renderedLineCount=count;$('#lineNumbers').textContent=Array.from({length:count},(_,index)=>index+1).join('\n');$('#lineCount').textContent=`${count} 行`;}
function update(recordHistory=true,options={}) {
  if(recordHistory)recordEditorHistory();
  updateWindowTitle();
  editorRevision++;
  if(options.lineStructureChanged!==false)refreshLineNumbers();
  cancelSourceMapBuild();setCompileStatus(sourceIsLong()?'等待输入停顿后排版…':'正在排版…');
  schedulePreviewRender(Boolean(options.forceRender));
  scheduleSave();
}
let pendingLineStructureChange=true;
editor.addEventListener('beforeinput',e=>{const start=editor.selectionStart,end=editor.selectionEnd,type=e.inputType||'',selectedHasBreak=end>start&&editor.value.indexOf('\n',start)<end;pendingLineStructureChange=selectedHasBreak||type==='insertParagraph'||type==='insertLineBreak'||type==='insertFromPaste'||type==='insertFromDrop'||String(e.data||'').includes('\n')||(type==='deleteContentBackward'&&editor.value[start-1]==='\n')||(type==='deleteContentForward'&&editor.value[start]==='\n');});
editor.addEventListener('input',e=>{scheduleEditorHistory(e.inputType||'input');update(false,{lineStructureChanged:pendingLineStructureChange});pendingLineStructureChange=true;});editor.addEventListener('select',updateEditorHistorySelection);titleInput.addEventListener('input',()=>{updateWindowTitle();scheduleSave();});
editor.addEventListener('scroll',()=>{$('#lineNumbers').scrollTop=editor.scrollTop;});
function syncText(value){return value.toLowerCase().replace(/\\(?:begin|end)\{[^}]+\}/g,' ').replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g,' ').replace(/[{}\[\]$\\^_&%#*`~|=:：，。；、（）()<>\s\-]+/g,'');}
function sourceLineText(line){return syncText(line.replace(/(?<!\\)%.*$/,'').replace(/\\item\b/g,'').replace(/\\(?:colorbox|textcolor)\{[^}]+\}\{/g,'{').replace(/\\(?:label|pagestyle|lhead|rhead|cfoot)\{[^}]*\}/g,''));}
function previewNodeText(node){if(previewTextCache.has(node))return previewTextCache.get(node);const copy=node.cloneNode(true);copy.querySelectorAll('.katex-mathml').forEach(x=>x.remove());const text=syncText(copy.textContent||'');previewTextCache.set(node,text);return text;}
function similarity(a,b){if(!a||!b)return 0;if(a===b)return 120;if((a.includes(b)||b.includes(a))&&Math.min(a.length,b.length)>=2)return 45+35*Math.min(a.length,b.length)/Math.max(a.length,b.length);if(a.length<3||b.length<3)return 0;const small=a.length<=b.length?a:b,large=a.length<=b.length?b:a;let hits=0;for(let i=0;i<small.length-1;i++)if(large.includes(small.slice(i,i+2)))hits++;return hits/Math.max(1,small.length-1)*30;}
function sourceCoordinates(source){const lines=source.split('\n'),offsets=[];let offset=0;for(const line of lines){offsets.push(offset);offset+=line.length+1;}const lineAt=position=>{let low=0,high=offsets.length-1;while(low<=high){const middle=(low+high)>>1;if(offsets[middle]<=position)low=middle+1;else high=middle-1;}return Math.max(1,high+1);};return {lines,offsets,lineAt};}
function setNodeSource(node,startOffset,endOffset,coordinates){if(!node||startOffset<0)return;const safeEnd=Math.max(startOffset,endOffset),startLine=coordinates.lineAt(startOffset),endLine=coordinates.lineAt(safeEnd);node.dataset.sourceStart=String(startLine);node.dataset.sourceEnd=String(endLine);node.dataset.sourceOffsetStart=String(startOffset);node.dataset.sourceOffsetEnd=String(safeEnd);node.title=startLine===endLine?`点击定位到源码第 ${startLine} 行`:`点击定位到源码第 ${startLine}–${endLine} 行`;}
function buildSourceMap(){for(const node of preview.querySelectorAll('[data-source-start]')){node.removeAttribute('data-source-start');node.removeAttribute('data-source-end');node.removeAttribute('data-source-offset-start');node.removeAttribute('data-source-offset-end');node.removeAttribute('title');}const source=editor.value,coordinates=sourceCoordinates(source),documentOffset=Math.max(0,source.indexOf('\\begin{document}')),documentLine=coordinates.lineAt(documentOffset),allNodes=[...preview.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,.theorem,.display-math,.display-equation,figure,figcaption,pre,td,th')].filter(node=>!node.closest('.note-toc'));const assignSequential=(selector,pattern)=>{const nodes=[...preview.querySelectorAll(selector)].filter(node=>!node.closest('.note-toc')),matches=[...source.matchAll(pattern)];for(let i=0;i<Math.min(nodes.length,matches.length);i++)setNodeSource(nodes[i],matches[i].index,matches[i].index+matches[i][0].length-1,coordinates);};
  assignSequential('h1',/\\title\{[^}]*\}/g);
  assignSequential('h2,h3,h4,h5,h6',/\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*?\{[^}]*\}/g);
  assignSequential('.display-equation',/\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\}/g);
  assignSequential('.display-math',/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g);
  assignSequential('.theorem',/\\begin\{(theorem|proof|defbox|thmbox|exbox|whybox|sumbox)\}(?:\[[^\]]*\])?[\s\S]*?\\end\{\1\}/g);
  assignSequential('blockquote',/\\begin\{quote\}[\s\S]*?\\end\{quote\}/g);
  assignSequential('pre',/\\begin\{(?:verbatim|lstlisting)\}[\s\S]*?\\end\{(?:verbatim|lstlisting)\}/g);
  assignSequential('li',/\\item\s+[^\n]*/g);
  assignSequential('figure',/\\begin\{(figure|table)\}(?:\[[^\]]*\])?[\s\S]*?\\end\{\1\}/g);
  assignSequential('figcaption',/\\caption\{[^}]*\}/g);
  const tableCells=[...preview.querySelectorAll('th,td')];let cellIndex=0;for(const block of source.matchAll(/\\begin\{tabularx?\}[^\n]*\n([\s\S]*?)\\end\{tabularx?\}/g)){const contentOffset=block.index+block[0].indexOf(block[1]);for(const row of block[1].matchAll(/^([^\n]*&[^\n]*?)\\\\\s*$/gm)){const raw=row[1];if(/^\s*\\(?:toprule|midrule|bottomrule|hline)/.test(raw))continue;let cursor=0;for(const part of raw.split('&')){if(cellIndex>=tableCells.length)break;const leading=part.match(/^\s*/)?.[0].length||0,trailing=part.match(/\s*$/)?.[0].length||0,start=contentOffset+row.index+cursor+leading,end=contentOffset+row.index+cursor+Math.max(leading,part.length-trailing);setNodeSource(tableCells[cellIndex++],start,end,coordinates);cursor+=part.length+1;}}}
  const lineData=coordinates.lines.map((line,index)=>({line:index+1,text:sourceLineText(line)})),exactLines=new Map(),windows=lineData.map((_,start)=>{const spans=[];let combined='';for(let length=1;length<=6&&start+length<=lineData.length;length++){combined+=lineData[start+length-1].text;spans.push(combined);}return spans;});for(let i=documentLine-1;i<lineData.length;i++){const text=lineData[i].text;if(!text)continue;if(!exactLines.has(text))exactLines.set(text,[]);exactLines.get(text).push(i);}let floor=documentLine;for(const node of allNodes){if(node.dataset.sourceStart){floor=Math.max(floor,Number(node.dataset.sourceStart));continue;}const text=previewNodeText(node);if(!text)continue;const exact=exactLines.get(text),exactIndex=exact?.find(index=>index+1>=floor);if(exactIndex!=null){const startOffset=coordinates.offsets[exactIndex],endOffset=(coordinates.offsets[exactIndex+1]??source.length)-1;setNodeSource(node,startOffset,endOffset,coordinates);floor=Math.max(floor,exactIndex+2);continue;}if(text.length>180){let start=-1;for(let i=Math.max(documentLine-1,floor-4);i<lineData.length;i++){if(lineData[i].text.length>=3&&text.startsWith(lineData[i].text)){start=i;break;}}if(start>=0){let end=start,combined='';for(let i=start;i<lineData.length;i++){if(i>start&&(!coordinates.lines[i].trim()||/^\s*\\(?:begin|end|section|subsection|subsubsection|paragraph|subparagraph)\b/.test(coordinates.lines[i])))break;combined+=lineData[i].text;end=i;if(combined.length>=text.length)break;}const startOffset=coordinates.offsets[start],endOffset=(coordinates.offsets[end+1]??source.length)-1;setNodeSource(node,startOffset,endOffset,coordinates);floor=Math.max(floor,end+2);continue;}}let best=null,bestScore=0;const search=(from,to)=>{for(let i=from;i<to;i++){const spans=windows[i];for(let span=0;span<spans.length;span++){const score=similarity(text,spans[span])-(span+1)*.35;if(score>bestScore){bestScore=score;best={start:i+1,end:i+span+1};if(score>118)return true;}}}return false;};search(Math.max(documentLine-1,floor-4),Math.min(lineData.length,floor+80));if(bestScore<8)search(documentLine-1,lineData.length);if(best&&bestScore>=8){const startOffset=coordinates.offsets[best.start-1],endOffset=(coordinates.offsets[best.end]??source.length)-1;setNodeSource(node,startOffset,endOffset,coordinates);floor=Math.max(floor,best.end+1);}}
}
function ensureSourceMap(){if(previewRevision!==editorRevision)return false;if(preview.children.length&&mappedRevision!==previewRevision){cancelSourceMapBuild();setCompileStatus('正在建立双向定位…');buildSourceMap();mappedRevision=previewRevision;setCompileStatus('即时排版 · 双向定位');}return true;}
function scrollPreviewTo(node,behavior='smooth'){if(!node||!previewStage)return;const stageRect=previewStage.getBoundingClientRect(),nodeRect=node.getBoundingClientRect(),delta=nodeRect.top-stageRect.top-(previewStage.clientHeight-nodeRect.height)/2,target=Math.max(0,previewStage.scrollTop+delta);previewStage.scrollTo({top:target,behavior});}
function highlightPreviewNode(node,scroll=true){preview.querySelectorAll('.source-sync-highlight').forEach(x=>x.classList.remove('source-sync-highlight'));if(!node)return;node.classList.add('source-sync-highlight');if(scroll)scrollPreviewTo(node);}
function clearPreviewTextHighlights(){const parents=new Set();preview.querySelectorAll('mark.source-word-highlight').forEach(mark=>{if(mark.parentNode)parents.add(mark.parentNode);mark.replaceWith(document.createTextNode(mark.textContent));});parents.forEach(parent=>parent.normalize());}
function highlightPreviewText(node,raw){clearPreviewTextHighlights();const needle=raw.trim();if(!needle||needle.length>160)return false;const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),textNodes=[];let current;while((current=walker.nextNode()))textNodes.push(current);for(const textNode of textNodes){const index=textNode.data.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());if(index<0)continue;const mark=document.createElement('mark');mark.className='source-word-highlight';const after=textNode.splitText(index),tail=after.splitText(needle.length);after.replaceWith(mark);mark.append(after);scrollPreviewTo(mark);return true;}return false;}
function editorLineAtCursor(){return editor.value.slice(0,editor.selectionStart).split('\n').length;}
function syncPreviewFromEditor(){clearPreviewTextHighlights();if(!ensureSourceMap())return;const line=editorLineAtCursor(),offset=editor.selectionStart,documentLine=editor.value.slice(0,Math.max(0,editor.value.indexOf('\\begin{document}'))).split('\n').length;if(line<documentLine){highlightPreviewNode(null,false);$('#compileStatus').textContent=`源码 ${line} 行 · 导言区无正文定位`;return;}const nodes=[...preview.querySelectorAll('[data-source-start]')];if(!nodes.length)return;let nearest=null,bestScore=-Infinity;for(const node of nodes){const start=Number(node.dataset.sourceStart),end=Number(node.dataset.sourceEnd),offsetStart=Number(node.dataset.sourceOffsetStart),offsetEnd=Number(node.dataset.sourceOffsetEnd),containsOffset=offset>=offsetStart&&offset<=offsetEnd,containsLine=line>=start&&line<=end,distance=containsLine?0:Math.min(Math.abs(line-start),Math.abs(line-end)),span=end-start,score=(containsOffset?200:containsLine?100:0)-distance*5-span*.15+similarity(sourceLineText(editor.value.split('\n')[line-1]||''),previewNodeText(node));if(score>bestScore){bestScore=score;nearest=node;}}highlightPreviewNode(nearest,true);$('#compileStatus').textContent=`源码 ${line} 行 → 预览 ${nearest?.dataset.sourceStart||''} 行`;}
function locateSelectedSource(){if(!ensureSourceMap())return toast('正在更新预览，请稍后再定位');const raw=editor.value.slice(editor.selectionStart,editor.selectionEnd).trim();if(!raw){syncPreviewFromEditor();return;}const selected=syncText(raw),line=editorLineAtCursor(),offset=editor.selectionStart,nodes=[...preview.querySelectorAll('[data-source-start]')];let best=null,bestScore=-Infinity;for(const node of nodes){const start=Number(node.dataset.sourceStart),end=Number(node.dataset.sourceEnd),offsetStart=Number(node.dataset.sourceOffsetStart),offsetEnd=Number(node.dataset.sourceOffsetEnd),nearLine=line>=start-2&&line<=end+2,containsOffset=offset>=offsetStart&&offset<=offsetEnd,score=similarity(selected,previewNodeText(node))+(containsOffset?140:nearLine?45:0)-Math.min(Math.abs(line-start),Math.abs(line-end));if(score>bestScore){bestScore=score;best=node;}}if(best&&bestScore>=8){highlightPreviewNode(best,!highlightPreviewText(best,raw));$('#compileStatus').textContent=`“${raw.slice(0,18)}${raw.length>18?'…':''}” → 预览`;}else{$('#compileStatus').textContent='未找到所选文字的预览位置';toast('右侧预览中没有找到这段文字');}}
function selectSource(line,startOffset=null,endOffset=null,includeLineBreak=false){const coordinates=sourceCoordinates(editor.value),safeLine=Math.max(1,Math.min(coordinates.lines.length,line)),lineStart=coordinates.offsets[safeLine-1],lineEnd=lineStart+(coordinates.lines[safeLine-1]?.length||0)+(includeLineBreak&&safeLine<coordinates.lines.length?1:0),start=startOffset??lineStart,end=endOffset??lineEnd;editor.focus();editor.setSelectionRange(start,end);const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||22;editor.scrollTop=Math.max(0,(safeLine-4)*lineHeight);$('#lineNumbers').scrollTop=editor.scrollTop;}
function findSourceOccurrenceNear(text,line,startLine=line,endLine=line,startOffset=null,endOffset=null){if(!text)return-1;const source=editor.value,coordinates=sourceCoordinates(source),from=startOffset??coordinates.offsets[Math.max(0,startLine-1)]??0,to=endOffset??coordinates.offsets[Math.min(coordinates.lines.length,endLine)]??source.length,needle=text.toLocaleLowerCase(),haystack=source.toLocaleLowerCase();let match=haystack.indexOf(needle,from),best=-1,distance=Infinity,lineOffset=startOffset??coordinates.offsets[Math.max(0,line-1)]??0;while(match>=0&&match<=to){const nextDistance=Math.abs(match-lineOffset);if(nextDistance<distance){best=match;distance=nextDistance;}match=haystack.indexOf(needle,match+Math.max(1,needle.length));}return best;}
const lineNumbers=$('#lineNumbers');lineNumbers.title='单击选中整行';lineNumbers.addEventListener('mousedown',e=>e.preventDefault());lineNumbers.addEventListener('click',e=>{const style=getComputedStyle(lineNumbers),lineHeight=parseFloat(style.lineHeight)||22,paddingTop=parseFloat(style.paddingTop)||0,relative=e.clientY-lineNumbers.getBoundingClientRect().top+lineNumbers.scrollTop-paddingTop,line=Math.max(1,Math.min(editor.value.split('\n').length,Math.floor(relative/lineHeight)+1));selectSource(line,null,null,true);updateEditorHistorySelection();$('#compileStatus').textContent=`已选中源码第 ${line} 行`;});
editor.addEventListener('dblclick',()=>setTimeout(locateSelectedSource,0));
editor.addEventListener('click',syncPreviewFromEditor);
const sourceLocateBtn=$('#sourceLocateBtn');
sourceLocateBtn.addEventListener('mousedown',e=>e.preventDefault());
sourceLocateBtn.onclick=()=>{locateSelectedSource();editor.focus({preventScroll:true});};
let previewClickTimer;
preview.addEventListener('click',e=>{const tocLink=e.target.closest('.note-toc a');if(tocLink){e.preventDefault();const target=preview.querySelector(tocLink.getAttribute('href'));if(target)scrollPreviewTo(target);return;}if(!ensureSourceMap())return;const node=e.target.closest('[data-source-start]');if(!node)return;clearTimeout(previewClickTimer);previewClickTimer=setTimeout(()=>{const line=Number(node.dataset.sourceStart);clearPreviewTextHighlights();selectSource(line);highlightPreviewNode(node,false);$('#compileStatus').textContent=`预览 → 源码 ${line} 行`;},240);});
preview.addEventListener('dblclick',e=>{clearTimeout(previewClickTimer);if(!ensureSourceMap())return;const node=e.target.closest('[data-source-start]');if(!node)return;const chosen=window.getSelection()?.toString().trim()||'',source=editor.value,lineHint=Number(node.dataset.sourceStart),rangeEnd=Number(node.dataset.sourceEnd)||lineHint,offsetStart=Number(node.dataset.sourceOffsetStart),offsetEnd=Number(node.dataset.sourceOffsetEnd);e.preventDefault();let start=findSourceOccurrenceNear(chosen,lineHint,lineHint,rangeEnd,offsetStart,offsetEnd);if(start<0&&chosen){const wanted=syncText(chosen),lines=source.split('\n');let bestLine=lineHint,bestScore=0;for(let i=Math.max(0,lineHint-3);i<Math.min(lines.length,rangeEnd+2);i++){const score=similarity(wanted,sourceLineText(lines[i]));if(score>bestScore){bestScore=score;bestLine=i+1;}}selectSource(bestLine);$('#compileStatus').textContent=`“${chosen.slice(0,18)}” → 源码 ${bestLine} 行`;}else if(start>=0){const line=source.slice(0,start).split('\n').length;selectSource(line,start,start+chosen.length);$('#compileStatus').textContent=`已选中源码“${chosen.slice(0,18)}${chosen.length>18?'…':''}”`;}else{selectSource(lineHint);}});
function wrapEditorSelection(before,after,placeholder){const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end),body=selected||placeholder;editor.setRangeText(before+body+after,start,end,'end');const innerStart=start+before.length;editor.setSelectionRange(innerStart,innerStart+body.length);editor.focus();update();}
function toggleLatexComment(){const source=editor.value,start=editor.selectionStart,end=editor.selectionEnd,lineStart=source.lastIndexOf('\n',start-1)+1,effectiveEnd=end>start&&source[end-1]==='\n'?end-1:end,nextBreak=source.indexOf('\n',effectiveEnd),lineEnd=nextBreak<0?source.length:nextBreak,block=source.slice(lineStart,lineEnd),lines=block.split('\n'),nonBlank=lines.filter(line=>line.trim()),shouldUncomment=nonBlank.length>0&&nonBlank.every(line=>/^\s*%/.test(line));const replacement=lines.map(line=>shouldUncomment?line.replace(/^(\s*)%\s?/,'$1'):line.replace(/^(\s*)/,'$1% ')).join('\n'),hadSelection=end>start;editor.setRangeText(replacement,lineStart,lineEnd,'end');if(hadSelection)editor.setSelectionRange(lineStart,lineStart+replacement.length);else{const nextCursor=Math.max(lineStart,start+(replacement.length-block.length));editor.setSelectionRange(nextCursor,nextCursor);}editor.focus();update();toast(shouldUncomment?'已取消 LaTeX 注释':'已添加 LaTeX 注释');}
function renumberGeneratedEquationLabels(source){const renames=new Map(),pattern=/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g;let number=0,match;while((match=pattern.exec(source))){number++;const label=match[1].match(/\\label\{([^}]+)\}/)?.[1];if(label&&(/^eq:formula-\d+$/.test(label)||label.startsWith('eq:folio-pending-')))renames.set(label,`eq:formula-${number}`);}let value=source,index=0;const tokens=[];for(const [oldLabel,newLabel] of renames){if(oldLabel===newLabel)continue;const token=`FOLIOEQLABELTOKEN${index++}`,escaped=oldLabel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');tokens.push([token,newLabel]);value=value.replace(new RegExp(`\\\\(label|eqref|ref)\\{${escaped}\\}`,'g'),(_,command)=>`\\${command}{${token}}`);}for(const [token,newLabel] of tokens)value=value.replaceAll(token,newLabel);return {value,renames};}
function insertNumberedEquation(tex=null){const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end),formula=(tex??selected).trim()||'E = mc^2',pendingLabel=`eq:folio-pending-${Date.now().toString(36)}`,leading=start>0&&editor.value[start-1]!=='\n'?'\n\n':'',trailing=end<editor.value.length&&editor.value[end]!=='\n'?'\n\n':'\n',before=`${leading}\\begin{equation}\n  `,after=`\n  \\label{${pendingLabel}}\n\\end{equation}${trailing}`;editor.setRangeText(before+formula+after,start,end,'end');const normalized=renumberGeneratedEquationLabels(editor.value),label=normalized.renames.get(pendingLabel)||pendingLabel;editor.value=normalized.value;const formulaStart=start+before.length;editor.setSelectionRange(formulaStart,formulaStart+formula.length);editor.focus();update();toast(`已插入带编号公式 · ${label}（编号已按位置更新）`);}
editor.addEventListener('keydown',e=>{const command=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();if(command&&!e.altKey&&key==='z'){e.preventDefault();e.shiftKey?redoEditor():undoEditor();return;}if(command&&!e.altKey&&key==='y'){e.preventDefault();redoEditor();return;}if(e.key==='Tab'){e.preventDefault();const s=editor.selectionStart;editor.setRangeText('  ',s,editor.selectionEnd,'end');update();return;}if(command&&!e.altKey&&(e.code==='Slash'||e.key==='/')){e.preventDefault();toggleLatexComment();return;}if(command&&!e.shiftKey&&!e.altKey&&key==='b'){e.preventDefault();wrapEditorSelection('\\textbf{','}','粗体文字');return;}if(command&&!e.shiftKey&&!e.altKey&&key==='i'){e.preventDefault();wrapEditorSelection('\\textit{','}','斜体文字');return;}if(command&&e.altKey&&!e.shiftKey&&key==='m'){e.preventDefault();insertNumberedEquation();return;}if(command&&e.shiftKey&&!e.altKey&&key==='m'){e.preventDefault();wrapEditorSelection('\\[\n','\n\\]','公式');return;}if(e.altKey&&e.key==='Enter'){e.preventDefault();locateSelectedSource();return;}if(command&&e.shiftKey&&key==='s'){e.preventDefault();saveProjectZip();}else if(command&&key==='s'){e.preventDefault();persist();saveRecoveryDraft();toast('恢复草稿已保存');}});
editor.addEventListener('beforeinput',e=>{if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){e.preventDefault();e.inputType==='historyUndo'?undoEditor():redoEditor();}});
document.querySelectorAll('[data-insert],[data-wrap]').forEach(btn=>btn.addEventListener('click',()=>{const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end),decode=value=>value.replace(/\\\\/g,'\\').replace(/\\n/g,'\n');let value=btn.dataset.insert?decode(btn.dataset.insert):'';if(btn.dataset.wrap){const [before,after]=btn.dataset.wrap.split('|').map(decode);value=before+selected+after;}editor.setRangeText(value,start,end,'end');editor.focus();update();}));
function insertListEnvironment(type){const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end).trim(),items=(selected?selected.split('\n'):['第一项','第二项']).map(line=>line.trim().replace(/^(?:[-+*]|\d+[.)]|\\item)\s*/, '')).filter(Boolean),environment=type==='ordered'?'enumerate':'itemize',value=`\n\\begin{${environment}}\n${items.map(item=>`  \\item ${item}`).join('\n')}\n\\end{${environment}}\n`;editor.setRangeText(value,start,end,'end');const first=value.indexOf(items[0]);editor.setSelectionRange(start+first,start+first+items[0].length);editor.focus();update();toast(type==='ordered'?'已插入编号列表':'已插入分点列表');}
function insertCodeBlock(){const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end)||'在这里输入代码',value=`\n\\begin{verbatim}\n${selected}\n\\end{verbatim}\n`;editor.setRangeText(value,start,end,'end');const contentStart=start+value.indexOf(selected);editor.setSelectionRange(contentStart,contentStart+selected.length);editor.focus();update();toast('已插入代码块');}
function applyTextEffect(type,color){ensureLatexPackages(['xcolor']);const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end)||(type==='highlight'?'重点内容':'彩色文字');let value;if(type==='highlight')value=selected.split('\n').map(line=>line?`\\colorbox{${color}}{\\strut ${line}}`:'').join('\n');else value=`\\textcolor{${color}}{${selected}}`;editor.setRangeText(value,start,end,'end');editor.focus();update();toast(type==='highlight'?'已添加荧光标记':'已修改文字颜色');}
$('#bulletListBtn').onclick=()=>insertListEnvironment('bullet');$('#numberListBtn').onclick=()=>insertListEnvironment('ordered');$('#codeBlockBtn').onclick=insertCodeBlock;
$('#highlightSelect').onchange=e=>{if(e.target.value)applyTextEffect('highlight',e.target.value);e.target.value='';};$('#textColorSelect').onchange=e=>{if(e.target.value)applyTextEffect('color',e.target.value);e.target.value='';};
const headingPlaceholders={section:'一级标题',subsection:'二级标题',subsubsection:'三级标题',paragraph:'段落标题',subparagraph:'子段落标题'};
$('#headingSelect').onchange=e=>{const command=e.target.value;if(!command)return;wrapEditorSelection(`\\${command}{`,'}',headingPlaceholders[command]);e.target.value='';};
$('#numberedEquationBtn').onclick=()=>insertNumberedEquation();
function ensureLatexPackages(names){const installed=new Set([...editor.value.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].flatMap(match=>match[1].split(',').map(name=>name.trim()))),missing=names.filter(name=>!installed.has(name));if(!missing.length)return;const point=editor.value.indexOf('\\begin{document}'),insertAt=point>=0?point:0;editor.setRangeText(`\\usepackage{${missing.join(',')}}\n`,insertAt,insertAt,'preserve');}
function nextTableLabel(){const used=new Set([...editor.value.matchAll(/\\label\{(tab:table-\d+)\}/g)].map(match=>match[1]));let index=1;while(used.has(`tab:table-${index}`))index++;return `tab:table-${index}`;}
function tableDimensions(){return {rows:Math.min(20,Math.max(1,Number($('#tableRows').value)||1)),columns:Math.min(10,Math.max(2,Number($('#tableColumns').value)||2)),header:$('#tableHeader').checked};}
function updateTableSizeHint(){const {rows,columns,header}=tableDimensions();$('#tableSizeHint').textContent=`将生成 ${rows+(header?1:0)} × ${columns} 表格`;}
function insertTable(){ensureLatexPackages(['booktabs','tabularx']);const {rows,columns,header}=tableDimensions(),caption=latexEscape($('#tableCaption').value.trim()||'表格标题'),label=nextTableLabel(),columnSpec=`@{}${Array(columns).fill('X').join(' ')}@{}`,headerRow=Array.from({length:columns},(_,i)=>`列 ${i+1}`),dataRows=Array.from({length:rows},(_,row)=>Array.from({length:columns},(_,column)=>`内容 ${row+1}-${column+1}`)),lines=['','\\begin{table}[htbp]','\\centering',`\\caption{${caption}}`,`\\label{${label}}`,`\\begin{tabularx}{\\textwidth}{${columnSpec}}`,'\\toprule'];if(header){lines.push(`  ${headerRow.join(' & ')} \\\\`,'\\midrule');}for(const row of dataRows)lines.push(`  ${row.join(' & ')} \\\\`);lines.push('\\bottomrule','\\end{tabularx}','\\end{table}','');const value=lines.join('\n'),documentStart=editor.value.indexOf('\\begin{document}'),documentEnd=editor.value.lastIndexOf('\\end{document}');let start=editor.selectionStart,end=editor.selectionEnd;if(documentStart>=0&&start<documentStart+'\\begin{document}'.length){start=end=documentEnd>documentStart?documentEnd:documentStart+'\\begin{document}'.length;}editor.setRangeText(value,start,end,'end');const firstPlaceholder=header?'列 1':'内容 1-1',cellStart=start+value.indexOf(firstPlaceholder);editor.setSelectionRange(cellStart,cellStart+firstPlaceholder.length);editor.focus();update();$('#tableDialog').close();toast(`已插入 ${rows+(header?1:0)} × ${columns} 表格 · ${label}`);}
const tableDialog=$('#tableDialog');$('#tableBtn').onclick=()=>{updateTableSizeHint();tableDialog.showModal();};$('[data-table-close]').onclick=()=>tableDialog.close();$('#tableRows').oninput=updateTableSizeHint;$('#tableColumns').oninput=updateTableSizeHint;$('#tableHeader').onchange=updateTableSizeHint;$('#insertTableBtn').onclick=insertTable;
$('#openBtn').onclick=()=>$('#fileInput').click();
$('#importMdBtn').onclick=()=>$('#fileInput').click();
function latexEscape(text){return text.replace(/([%&#_{}])/g,'\\$1').replace(/~/g,'\\textasciitilde{}').replace(/\^/g,'\\textasciicircum{}');}
function mdInline(text){const saved=[];const hold=value=>{saved.push(value);return `@@FOLIO${saved.length-1}@@`;};let out=text.replace(/`([^`]+)`/g,(_,x)=>hold(`\\texttt{${latexEscape(x)}}`)).replace(/\$([^$\n]+)\$/g,(_,x)=>hold(`$${x}$`)).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,url)=>hold(`\\href{${url}}{[图片：${latexEscape(alt||url)}]}`)).replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>hold(`\\href{${url}}{${latexEscape(label)}}`));out=latexEscape(out).replace(/\*\*([^*]+)\*\*/g,'\\textbf{$1}').replace(/__([^_]+)__/g,'\\textbf{$1}').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'\\textit{$1}');return out.replace(/@@FOLIO(\d+)@@/g,(_,i)=>saved[Number(i)]);}
function markdownToLatex(markdown){const lines=markdown.replace(/\r/g,'').split('\n'),headingCommands=['section','subsection','subsubsection','paragraph','subparagraph'];let title='Markdown 笔记',body=[],list=null,inCode=false,code=[];const closeList=()=>{if(list){body.push(`\\end{${list}}`);list=null;}};for(let i=0;i<lines.length;i++){const line=lines[i];if(/^```/.test(line)){if(inCode){body.push('\\begin{verbatim}\n'+code.join('\n')+'\n\\end{verbatim}');code=[];inCode=false;}else{closeList();inCode=true;}continue;}if(inCode){code.push(line);continue;}const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){closeList();const level=heading[1].length,text=heading[2].trim();if(level===1&&title==='Markdown 笔记')title=text;else{const command=headingCommands[Math.max(0,Math.min(level-2,headingCommands.length-1))];body.push(`\\${command}{${mdInline(text)}}`);}continue;}if(/^\s*[-*_]{3,}\s*$/.test(line)){closeList();body.push('\\hrulefill');continue;}const bullet=line.match(/^\s*[-+*]\s+(.+)$/),numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);if(bullet||numbered){const wanted=bullet?'itemize':'enumerate';if(list!==wanted){closeList();list=wanted;body.push(`\\begin{${list}}`);}body.push(`  \\item ${mdInline((bullet||numbered)[1])}`);continue;}closeList();const quote=line.match(/^>\s?(.*)$/);if(quote){body.push(`\\begin{whybox}\n${mdInline(quote[1])}\n\\end{whybox}`);continue;}if(/^\s*\$\$\s*$/.test(line)){const math=[];i++;while(i<lines.length&&!/^\s*\$\$\s*$/.test(lines[i]))math.push(lines[i++]);body.push('\\[\n'+math.join('\n')+'\n\\]');continue;}body.push(line.trim()?mdInline(line):'');}closeList();if(inCode)body.push('\\begin{verbatim}\n'+code.join('\n')+'\n\\end{verbatim}');let preamble=defaultDocument.slice(0,defaultDocument.indexOf('\\begin{document}'));preamble=preamble.replace(/\\title\{[^}]*\}/,`\\title{${latexEscape(title)}}`);return {title,content:`${preamble}\\begin{document}\n\\maketitle\n\\tableofcontents\n\\newpage\n\n${body.join('\n')}\n\n\\end{document}`};}
$('#fileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.name.toLowerCase().endsWith('.zip')){const files=await readZip(new Uint8Array(await file.arrayBuffer()));const tex=files.get('main.tex')||[...files].find(([name])=>name.endsWith('/main.tex'))?.[1];if(!tex)throw new Error('ZIP 中找不到 main.tex');editor.value=new TextDecoder().decode(tex);replaceProjectImages({});for(const [name,data] of files){const marker=name.lastIndexOf('/images/'),isRoot=name.startsWith('images/');if(!isRoot&&marker<0)continue;const short=isRoot?name.slice(7):name.slice(marker+8);if(!short||short.endsWith('/'))continue;projectImages[short]=`data:${mimeFor(name)};base64,${bytesToBase64(data)}`;}titleInput.value=file.name.replace(/\.zip$/i,'');}else if(/\.(md|markdown)$/i.test(file.name)){const converted=markdownToLatex(await file.text());editor.value=converted.content;titleInput.value=converted.title;replaceProjectImages({});toast('Markdown 已转换为 CMU LaTeX 模板');}else{editor.value=await file.text();titleInput.value=file.name.replace(/\.tex$/i,'');replaceProjectImages({});}update();if(!/\.(md|markdown)$/i.test(file.name))toast(`已打开 ${file.name}`);}catch(err){toast(`无法打开项目：${err.message}`);}e.target.value='';};
$('#downloadBtn').onclick=()=>{const blob=new Blob([editor.value],{type:'text/x-tex;charset=utf-8'}),name=documentFilename('tex'),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);toast(`已下载 ${name}`);};
function crc32(data){let crc=-1;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
function makeZip(entries){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;for(const [name,value] of entries){const filename=enc.encode(name),data=value instanceof Uint8Array?value:enc.encode(value),crc=crc32(data);const local=new Uint8Array(30+filename.length+data.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,filename.length,true);local.set(filename,30);local.set(data,30+filename.length);locals.push(local);const central=new Uint8Array(46+filename.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);central.set(filename,46);centrals.push(central);offset+=local.length;}const centralSize=centrals.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...locals,...centrals,end],{type:'application/zip'});}
async function readZip(bytes){const out=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();let eocd=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}}if(eocd<0)throw new Error('不是有效的 ZIP 项目');const count=view.getUint16(eocd+10,true);let p=view.getUint32(eocd+16,true);for(let i=0;i<count;i++){if(view.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 目录损坏');const method=view.getUint16(p+10,true),compressed=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),localOffset=view.getUint32(p+42,true),name=dec.decode(bytes.slice(p+46,p+46+nameLen)),localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLen+localExtraLen,chunk=bytes.slice(start,start+compressed);let data;if(method===0)data=chunk;else if(method===8&&'DecompressionStream' in window){const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));data=new Uint8Array(await new Response(stream).arrayBuffer());}else throw new Error(`不支持 ZIP 压缩方法 ${method}`);out.set(name,data);p+=46+nameLen+extraLen+commentLen;}return out;}
const bytesToBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const mimeFor=name=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'}[name.split('.').pop().toLowerCase()]||'application/octet-stream');
async function saveProjectZip(){const entries=[['main.tex',editor.value],['README.txt','Open main.tex with any LaTeX editor or upload this ZIP to Overleaf.\nImages are stored in images/.\n']];for(const [name,url] of Object.entries(projectImages)){const encoded=url.split(',')[1]||'';entries.push([`images/${name}`,Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))]);}const blob=makeZip(entries),name=documentFilename('zip'),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);persist();await saveRecoveryDraft();toast(`${name} 已保存（${Object.keys(projectImages).length} 张图片）`);}
$('#saveLocalBtn').onclick=saveProjectZip;
$('#imageBtn').onclick=()=>$('#imageInput').click();
function imageExtension(type='image/png'){return ({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'})[type]||'png';}
function uniqueImageName(original,type){const fallback=`pasted-${new Date().toISOString().replace(/[:.]/g,'-')}.${imageExtension(type)}`,source=(original&&original!=='image.png'?original:fallback).replace(/\s+/g,'-').replace(/[^\w\-.\u3400-\u9fff]/g,'-');let name=source,n=2;while(projectImages[name]){const dot=source.lastIndexOf('.');name=dot<0?`${source}-${n}`:`${source.slice(0,dot)}-${n}${source.slice(dot)}`;n++;}return name;}
function insertImageFile(file,preferredName){return new Promise(resolve=>{if(!file||!file.type.startsWith('image/'))return resolve(false);if(file.size>8*1024*1024){toast('单张图片请不要超过 8 MB');return resolve(false);}const reader=new FileReader();reader.onload=()=>{const name=uniqueImageName(preferredName||file.name,file.type);projectImages[name]=reader.result;markProjectImagesChanged();const label=`fig:${Date.now().toString(36)}`,snippet=`\n\\begin{figure}[H]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{images/${name}}\n  \\caption{图片说明}\n  \\label{${label}}\n\\end{figure}\n`;editor.setRangeText(snippet,editor.selectionStart,editor.selectionEnd,'end');update();toast(`已插入 images/${name}`);resolve(true);};reader.onerror=()=>{toast('图片读取失败');resolve(false);};reader.readAsDataURL(file);});}
$('#imageInput').onchange=async e=>{const files=[...e.target.files];for(const file of files)await insertImageFile(file);e.target.value='';};
editor.addEventListener('paste',async e=>{const images=[...e.clipboardData.items].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(!images.length)return;e.preventDefault();for(const image of images)await insertImageFile(image,`pasted-${Date.now()}.${imageExtension(image.type)}`);});
$('#newBtn').onclick=()=>{if(editor.value!==defaultDocument&&!confirm('新建会替换当前编辑区，确认继续？'))return;editor.value=defaultDocument;titleInput.value='CMU 风格课程笔记';replaceProjectImages({});update();};
function renderLatestPreview(){if(previewRevision===editorRevision&&lastRenderedImageRevision===projectImagesRevision&&lastRenderedBackendRevision===renderBackendRevision)return;cancelPreviewRender();cancelSourceMapBuild();commitPreviewRender(editor.value,editorRevision,true);}
function preparePrint(){document.title=documentFilename();renderLatestPreview();clearPreviewTextHighlights();preview.querySelectorAll('.source-sync-highlight').forEach(node=>node.classList.remove('source-sync-highlight'));}
$('#printBtn').onclick=()=>{preparePrint();requestAnimationFrame(()=>window.print());};window.addEventListener('beforeprint',preparePrint);window.addEventListener('afterprint',()=>{updateWindowTitle();scheduleSourceMapBuild(previewRevision);});
function setZoom(next){zoom=Math.min(1.4,Math.max(.6,next));preview.style.zoom=zoom;$('#zoomValue').textContent=Math.round(zoom*100)+'%';} $('#zoomIn').onclick=()=>setZoom(zoom+.1);$('#zoomOut').onclick=()=>setZoom(zoom-.1);
const divider=$('#divider'), left=$('.editor-pane'); divider.addEventListener('pointerdown',e=>{divider.setPointerCapture(e.pointerId);divider.classList.add('dragging');});divider.addEventListener('pointermove',e=>{if(!divider.hasPointerCapture(e.pointerId))return;left.style.width=Math.min(72,Math.max(28,e.clientX/window.innerWidth*100))+'%';});divider.addEventListener('pointerup',e=>{divider.releasePointerCapture(e.pointerId);divider.classList.remove('dragging');});

const dialog=$('#githubDialog'),githubPathInput=$('#ghPath');let githubPathAuto=true;githubPathInput.addEventListener('input',()=>githubPathAuto=false);$('#githubBtn').onclick=()=>{if(githubPathAuto){const current=githubPathInput.value.trim(),slash=current.lastIndexOf('/'),directory=slash>=0?current.slice(0,slash+1):'';githubPathInput.value=directory+documentFilename('tex');}dialog.showModal();}; $('[data-close]').onclick=()=>dialog.close();
const templateDialog=$('#templateDialog'), helpDialog=$('#helpDialog');
const zhihuDialog=$('#zhihuDialog');
$('#templateGrid').innerHTML=templates.map(t=>`<button class="template-card" data-template="${t.id}"><span class="template-icon">${t.icon}</span><strong>${t.name}</strong><small>${t.description}</small></button>`).join('');
$('#templateBtn').onclick=()=>templateDialog.showModal(); $('[data-template-close]').onclick=()=>templateDialog.close();
$('#helpBtn').onclick=()=>helpDialog.showModal(); $('[data-help-close]').onclick=()=>helpDialog.close();
$('#zhihuBtn').onclick=()=>zhihuDialog.showModal(); $('[data-zhihu-close]').onclick=()=>zhihuDialog.close();
function readLatexGroup(value,start){if(value[start]!=='{')return null;let depth=0;for(let index=start;index<value.length;index++){if(value[index]==='\\'){index++;continue;}if(value[index]==='{')depth++;else if(value[index]==='}'&&--depth===0)return {content:value.slice(start+1,index),end:index+1};}return null;}
function readLatexOptionalGroup(value,start){if(value[start]!=='[')return null;let depth=0;for(let index=start;index<value.length;index++){if(value[index]==='\\'){index++;continue;}if(value[index]==='[')depth++;else if(value[index]===']'&&--depth===0)return {content:value.slice(start+1,index),end:index+1};}return null;}
function readLatexHeading(value,start){let cursor=start;while(/\s/.test(value[cursor]||''))cursor++;const optional=readLatexOptionalGroup(value,cursor);if(optional){cursor=optional.end;while(/\s/.test(value[cursor]||''))cursor++;}const group=readLatexGroup(value,cursor);if(!group)return null;cursor=group.end;const lineBreak=value.slice(cursor).match(/^[ \t]*\\\\(?=[ \t]*(?:\r?\n|$))/);if(lineBreak)cursor+=lineBreak[0].length;return {content:group.content,shortTitle:optional?.content||'',end:cursor};}
function replaceBalancedLatexCommand(value,command,argCount,formatter){const expression=new RegExp(`\\\\${command}(?![A-Za-z@])`,'g');let output='',cursor=0,match;while((match=expression.exec(value))){let end=expression.lastIndex,args=[],valid=true;for(let index=0;index<argCount;index++){while(/\s/.test(value[end]||''))end++;const group=readLatexGroup(value,end);if(!group){valid=false;break;}args.push(group.content);end=group.end;}if(!valid)continue;output+=value.slice(cursor,match.index)+formatter(args);cursor=end;expression.lastIndex=end;}return output+value.slice(cursor);}
function markdownCodeSpan(value){const longest=Math.max(0,...[...value.matchAll(/`+/g)].map(match=>match[0].length)),fence='`'.repeat(longest+1);return `${fence}${value}${fence}`;}
function markdownCodeBlock(value,language=''){const longest=Math.max(0,...[...value.matchAll(/`+/g)].map(match=>match[0].length)),fence='`'.repeat(Math.max(3,longest+1));return `\n${fence}${language}\n${value.replace(/^\n|\n$/g,'')}\n${fence}\n`;}
let markdownProtectionSerial=0;
function latexInlineToMarkdown(value){const protectedValues=[],protectionId=++markdownProtectionSerial,hold=content=>{protectedValues.push(content);return `\uE100${protectionId}:${protectedValues.length-1}\uE101`;};let output=value;
  output=output.replace(/\\\(([\s\S]*?)\\\)/g,(_,math)=>hold(`$${math.trim()}$`)).replace(/(?<!\\)\$((?:\\.|[^$\n])*)(?<!\\)\$/g,(_,math)=>hold(`$${math.trim()}$`)).replace(/\\verb(.)([\s\S]*?)\1/g,(_,delimiter,code)=>hold(markdownCodeSpan(code)));
  const commands=[
    ['colorbox',2,args=>hold(`**${latexInlineToMarkdown(args[1].replace(/^\\strut\s*/,''))}**`)],
    ['textcolor',2,args=>hold(latexInlineToMarkdown(args[1]))],
    ['textbf',1,args=>hold(`**${latexInlineToMarkdown(args[0])}**`)],
    ['textit',1,args=>hold(`_${latexInlineToMarkdown(args[0])}_`)],
    ['emph',1,args=>hold(`_${latexInlineToMarkdown(args[0])}_`)],
    ['texttt',1,args=>hold(markdownCodeSpan(args[0].replace(/\\([_%&#$])/g,'$1')))],
    ['sout',1,args=>hold(`~~${latexInlineToMarkdown(args[0])}~~`)],
    ['underline',1,args=>hold(`<u>${latexInlineToMarkdown(args[0])}</u>`)],
    ['textsuperscript',1,args=>hold(`<sup>${latexInlineToMarkdown(args[0])}</sup>`)],
    ['textsubscript',1,args=>hold(`<sub>${latexInlineToMarkdown(args[0])}</sub>`)],
    ['href',2,args=>hold(`[${latexInlineToMarkdown(args[1])}](${args[0].replace(/\\([_%&#$])/g,'$1')})`)],
    ['url',1,args=>hold(`<${args[0].replace(/\\([_%&#$])/g,'$1')}>`)],
    ['footnote',1,args=>hold(`（${latexInlineToMarkdown(args[0])}）`)],
    ['enquote',1,args=>hold(`“${latexInlineToMarkdown(args[0])}”`)],
    ['texorpdfstring',2,args=>hold(latexInlineToMarkdown(args[0]))],
    ['mbox',1,args=>hold(latexInlineToMarkdown(args[0]))],
    ['textnormal',1,args=>hold(latexInlineToMarkdown(args[0]))],
    ['textrm',1,args=>hold(latexInlineToMarkdown(args[0]))],
    ['textsf',1,args=>hold(latexInlineToMarkdown(args[0]))],
    ['textsc',1,args=>hold(latexInlineToMarkdown(args[0]))],
  ];
  for(const [command,args,formatter] of commands)output=replaceBalancedLatexCommand(output,command,args,formatter);
  output=output.replace(/\\textasciitilde\{\}/g,'~').replace(/\\textasciicircum\{\}/g,'^').replace(/\\textbackslash\{\}/g,()=>hold('\\\\')).replace(/\\LaTeX(?:\{\})?/g,'LaTeX').replace(/\\TeX(?:\{\})?/g,'TeX').replace(/\\(?:ldots|dots|cdots)\b/g,'…').replace(/``([^']+)''/g,'“$1”').replace(/---/g,'—').replace(/--/g,'–').replace(/~/g,' ');
  output=output.replace(/\\([_%&#{}])/g,'$1').replace(/\\\$/g,()=>hold('\\$')).replace(/\\\*/g,()=>hold('\\*')).replace(/\\(?:quad|qquad|enspace|thinspace)\b|\\[,;:!]/g,' ').replace(/\\(?:noindent|raggedright|raggedleft)\b/g,'').replace(/\\(?:smallskip|medskip|bigskip|par)\b/g,'\n\n').replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g,' ');
  output=output.replace(/`/g,'\\`').replace(/([*_])/g,'\\$1').replace(/^(\s*)([#>])/gm,'$1\\$2');
  const restore=content=>content.replace(new RegExp(`\uE100${protectionId}:(\\d+)\uE101`,'g'),(_,index)=>restore(protectedValues[Number(index)]));return restore(output);
}
function replaceLatexHeadings(value,hold){const marks={section:'##',subsection:'###',subsubsection:'####',paragraph:'#####',subparagraph:'######'},expression=/\\(section|subsection|subsubsection|paragraph|subparagraph)(\*)?(?![A-Za-z@*])/g;let output='',cursor=0,match;while((match=expression.exec(value))){const heading=readLatexHeading(value,expression.lastIndex);if(!heading)continue;output+=value.slice(cursor,match.index)+hold(`\n\n${marks[match[1]]} ${latexInlineToMarkdown(heading.content)}\n\n`);cursor=heading.end;expression.lastIndex=heading.end;}return output+value.slice(cursor);}
function collectLatexReferences(source){const references=new Map();let equation=0,table=0,figure=0;for(const match of source.matchAll(/\\begin\{equation(\*)?\}([\s\S]*?)\\end\{equation\1\}/g)){if(match[1])continue;equation++;const label=match[2].match(/\\label\{([^}]+)\}/)?.[1];if(label)references.set(label,String(equation));}for(const match of source.matchAll(/\\begin\{table\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{table\}/g)){table++;const label=match[1].match(/\\label\{([^}]+)\}/)?.[1];if(label)references.set(label,String(table));}for(const match of source.matchAll(/\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g)){figure++;const label=match[1].match(/\\label\{([^}]+)\}/)?.[1];if(label)references.set(label,String(figure));}const levels={section:0,subsection:1,subsubsection:2,paragraph:3,subparagraph:4},counts=[0,0,0,0,0],headings=/\\(section|subsection|subsubsection|paragraph|subparagraph)(\*)?(?![A-Za-z@*])/g;let match;while((match=headings.exec(source))){const heading=readLatexHeading(source,headings.lastIndex);if(!heading)continue;headings.lastIndex=heading.end;if(match[2])continue;const level=levels[match[1]];counts[level]++;counts.fill(0,level+1);const label=source.slice(heading.end).match(/^[ \t]*(?:\r?\n[ \t]*)?\\label\{([^}]+)\}/)?.[1];if(label)references.set(label,counts.slice(0,level+1).join('.'));}return references;}
function findLatexListEnd(value,start){const tokens=/\\(begin|end)\{(itemize|enumerate|description)\}/g;tokens.lastIndex=start;let depth=0,match;while((match=tokens.exec(value))){depth+=match[1]==='begin'?1:-1;if(depth===0)return {start:match.index,end:tokens.lastIndex};}return null;}
function splitLatexListItems(value){const tokens=/\\(begin|end)\{(?:itemize|enumerate|description)\}|\\item(?:\[([^\]]*)\])?/g;let depth=0,current=null,items=[],match;while((match=tokens.exec(value))){if(match[1]==='begin'){depth++;continue;}if(match[1]==='end'){depth--;continue;}if(depth===0){if(current)current.content+=value.slice(current.cursor,match.index);if(current)items.push(current);current={label:match[2]||'',content:'',cursor:tokens.lastIndex};}}if(current){current.content+=value.slice(current.cursor);items.push(current);}return items;}
function convertLatexLists(value,depth=0){const begin=/\\begin\{(itemize|enumerate|description)\}/g;let match;while((match=begin.exec(value))){const range=findLatexListEnd(value,match.index);if(!range)break;const content=value.slice(begin.lastIndex,range.start),items=splitLatexListItems(content),indent='  '.repeat(depth),rendered=items.map((item,index)=>{const converted=convertLatexLists(item.content.trim(),depth+1),lines=converted.split('\n'),marker=match[1]==='enumerate'?`${index+1}.`:'-',label=match[1]==='description'&&item.label?`**${item.label}：** `:'';return `${indent}${marker} ${label}${lines[0]||''}${lines.slice(1).map(line=>line?`\n${line.startsWith('  '.repeat(depth+1))?line:`${indent}  ${line}`}`:'').join('')}`;}).join('\n');value=value.slice(0,match.index)+`\n${rendered}\n`+value.slice(range.end);begin.lastIndex=match.index+rendered.length+2;}return value;}
function latexTableToZhihuMarkdown(block){const content=block.match(/\\begin\{tabularx?\}[^\n]*\n([\s\S]*?)\\end\{tabularx?\}/)?.[1];if(!content)return '\n> [复杂表格请参考原 LaTeX 文档]\n';const hasHeader=/\\midrule\b/.test(content),rows=content.replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g,'').split(/\\\\(?:\[[^\]]*\])?/).map(row=>row.trim()).filter(Boolean).map(row=>row.split('&').map(cell=>latexInlineToMarkdown(cell.trim()).replace(/\|/g,'\\|')));if(!rows.length)return '';const width=Math.max(...rows.map(row=>row.length)),header=hasHeader?rows.shift():Array.from({length:width},(_,index)=>`列 ${index+1}`),caption=block.match(/\\caption\{([^}]*)\}/)?.[1]||'',line=row=>`| ${Array.from({length:width},(_,index)=>row[index]||'').join(' | ')} |`;return `\n${caption?`**表：${latexInlineToMarkdown(caption)}**\n\n`:''}${line(header)}\n${line(Array(width).fill('---'))}\n${rows.map(line).join('\n')}\n`;}
function normalizeZhihuMarkdown(value){const lines=value.replace(/\r\n?/g,'\n').split('\n'),output=[];let fence='',inMath=false,headingPending=false;for(let line of lines){const fenceMatch=line.match(/^\s*(`{3,}|~{3,})/);if(fenceMatch){const marker=fenceMatch[1][0];if(!fence)fence=marker;else if(fence===marker)fence='';output.push(line);headingPending=false;continue;}if(fence){output.push(line);continue;}if(/^\s*\$\$\s*$/.test(line)){inMath=!inMath;output.push('$$');headingPending=false;continue;}if(inMath){output.push(line);continue;}const heading=line.match(/^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$/);if(heading){if(output.length&&output.at(-1)!=='')output.push('');output.push(`${heading[1]} ${heading[2]}`);headingPending=true;continue;}if(!line.trim()){if(output.length&&output.at(-1)!=='')output.push('');continue;}if(headingPending&&output.at(-1)!=='')output.push('');headingPending=false;const trailing=line.match(/[ \t]+$/)?.[0];if(trailing&&trailing!=='  ')line=line.slice(0,-trailing.length);output.push(line);}while(output[0]==='')output.shift();while(output.at(-1)==='')output.pop();return output.join('\n');}
function latexToZhihuMarkdown(source){let body=source.replace(/^[\s\S]*?\\begin\{document\}/,'').replace(/\\end\{document\}[\s\S]*$/,'').replace(/\\maketitle|\\tableofcontents|\\(?:newpage|clearpage|pagebreak)\b/g,''),blocks=[],references=collectLatexReferences(source);const hold=value=>{blocks.push(value);return `@@ZHIHUBLOCK${blocks.length-1}@@`;};let equationNumber=0;
  body=body.replace(/\\begin\{(verbatim|lstlisting)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g,(_,environment,options,code)=>{const language=environment==='lstlisting'?(options?.match(/language\s*=\s*([^,\]]+)/i)?.[1]||'').toLowerCase():'';return hold(markdownCodeBlock(code,language));}).replace(/(^|[^\\])%[^\n]*/g,'$1');
  body=body.replace(/\\begin\{equation(\*)?\}([\s\S]*?)\\end\{equation\1\}/g,(_,star,value)=>{let math=value.replace(/\\label\{[^}]+\}/g,'').trim();if(!star&&!/\\tag\{/.test(math))math+=`\n\\tag{${++equationNumber}}`;else if(!star)equationNumber++;return hold(`\n$$\n${math}\n$$\n`);});
  body=body.replace(/\\begin\{(align\*?|alignat\*?|gather\*?|multline\*?)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g,(_,environment,value)=>{const wrapper=environment.startsWith('gather')?'gathered':'aligned',math=value.replace(/\\label\{[^}]+\}/g,'').replace(/\\notag\b/g,'').trim();return hold(`\n$$\n\\begin{${wrapper}}\n${math}\n\\end{${wrapper}}\n$$\n`);});
  body=body.replace(/\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\begin\{displaymath\}([\s\S]*?)\\end\{displaymath\}/g,(_,a,b,c)=>hold(`\n$$\n${(a||b||c).trim()}\n$$\n`));
  body=body.replace(/\\begin\{table\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{table\}/g,match=>hold(latexTableToZhihuMarkdown(match))).replace(/\\begin\{tabularx?\}[^\n]*\n[\s\S]*?\\end\{tabularx?\}/g,match=>hold(latexTableToZhihuMarkdown(match)));
  body=body.replace(/\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g,(_,value)=>{const name=value.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1]||'图片',caption=(value.match(/\\caption\{([^}]+)\}/)?.[1]||name).replace(/]/g,'\\]'),url=encodeURI(name).replace(/\(/g,'%28').replace(/\)/g,'%29');return hold(`\n![${latexInlineToMarkdown(caption)}](${url})\n`);});
  body=replaceLatexHeadings(body,hold);
  body=latexInlineToMarkdown(body);
  body=convertLatexLists(body);
  const boxNames={defbox:'定义',thmbox:'定理',exbox:'例题',whybox:'直觉',sumbox:'总结'};body=body.replace(/\\begin\{(defbox|thmbox|exbox|whybox|sumbox)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g,(_,type,label,value)=>`\n> **${boxNames[type]}${label?'：'+label:''}**\n> ${value.trim().replace(/\n/g,'\n> ')}\n`).replace(/\\begin\{(theorem|proof)\}([\s\S]*?)\\end\{\1\}/g,(_,type,value)=>`\n> **${type==='proof'?'证明':'定理'}：** ${value.trim().replace(/\n/g,'\n> ')}\n`).replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g,(_,value)=>`\n${value.trim().split('\n').map(line=>`> ${line}`).join('\n')}\n`).replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g,(_,value)=>`\n> **摘要：** ${value.trim().replace(/\n/g,'\n> ')}\n`);
  body=body.replace(/\\eqref\{([^}]+)\}/g,(_,label)=>`(${references.get(label)??label})`).replace(/\\ref\{([^}]+)\}/g,(_,label)=>references.get(label)??`[${label}]`).replace(/\\autoref\{([^}]+)\}/g,(_,label)=>references.get(label)??`[${label}]`).replace(/\\cite(?:\[[^\]]*\])?\{([^}]+)\}/g,(_,keys)=>`[${keys.split(',').map(key=>key.trim()).join(', ')}]`);
  body=body.replace(/\\(?:centering|raggedright|raggedleft)\b|\\label\{[^}]+\}/g,'').replace(/\\(?:begin|end)\{(?:center|flushleft|flushright)\}/g,'').replace(/\\(?:newline|linebreak)\b/g,'  \n').replace(/\\today\b/g,new Date().toLocaleDateString('zh-CN')).replace(/\\hrulefill\b/g,'\n\n---\n\n').replace(/^\s*%(?!%)[^\n]*$/gm,'').replace(/\\\\(?:\[[^\]]*\])?[ \t]*(?:\r?\n)?/g,'  \n');
  body=body.replace(/@@ZHIHUBLOCK(\d+)@@/g,(_,index)=>blocks[Number(index)]);return normalizeZhihuMarkdown(body);}
function zhihuMarkdownDocument(){const title=latexInlineToMarkdown(titleInput.value.trim()||'未命名文章'),body=latexToZhihuMarkdown(editor.value);return normalizeZhihuMarkdown(`# ${title}${body?`\n\n${body}`:''}`)+'\n';}
function buildZhihuClipboard(){renderLatestPreview();clearPreviewTextHighlights();const clone=preview.cloneNode(true),originalElements=[...preview.querySelectorAll('*')],cloneElements=[...clone.querySelectorAll('*')],properties=['display','color','background-color','font-family','font-size','font-weight','font-style','line-height','text-align','text-decoration','vertical-align','white-space','border','border-top','border-right','border-bottom','border-left','border-collapse','border-spacing','border-radius','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','width','max-width','height','min-height','position','top','left','right','bottom'];for(let i=0;i<Math.min(originalElements.length,cloneElements.length);i++){const computed=getComputedStyle(originalElements[i]),target=cloneElements[i];for(const property of properties){const value=computed.getPropertyValue(property);if(value&&value!=='normal'&&value!=='none'&&value!=='auto')target.style.setProperty(property,value);}}clone.querySelectorAll('.katex-mathml,.note-toc').forEach(node=>node.remove());clone.querySelector('h1')?.remove();clone.querySelector('.author')?.remove();for(const target of clone.querySelectorAll('*'))for(const attribute of [...target.attributes])if(attribute.name==='class'||attribute.name==='id'||attribute.name==='title'||attribute.name.startsWith('data-source-'))target.removeAttribute(attribute.name);const title=`<h1 style="font-size:28px;line-height:1.35;margin:0 0 24px;font-weight:700;color:#111">${escapeHtml(titleInput.value||'未命名文章')}</h1>`,html=`<article>${title}${clone.innerHTML}</article>`,plain=zhihuMarkdownDocument();return {html,plain};}
function legacyCopyRichText(html){const container=document.createElement('div');container.contentEditable='true';container.style.cssText='position:fixed;left:-10000px;top:0;width:800px;';container.innerHTML=html;document.body.appendChild(container);const range=document.createRange();range.selectNodeContents(container);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const copied=document.execCommand('copy');selection.removeAllRanges();container.remove();return copied;}
function downloadText(text,name,type='text/plain'){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
$('#downloadZhihuMd').onclick=()=>{const name=documentFilename('md');downloadText(zhihuMarkdownDocument(),name,'text/markdown;charset=utf-8');toast(`已下载 ${name}`);};
$('#copyZhihuBtn').onclick=async()=>{const {html,plain}=buildZhihuClipboard();try{if(window.ClipboardItem&&navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);else if(!legacyCopyRichText(html))throw new Error('浏览器拒绝复制');toast('已复制知乎富文本，可直接粘贴');zhihuDialog.close();}catch{if(legacyCopyRichText(html)){toast('已通过兼容模式复制，可直接粘贴');zhihuDialog.close();}else{await navigator.clipboard?.writeText?.(plain);toast('已复制 Markdown 文本');}}};
$('#templateGrid').onclick=e=>{const card=e.target.closest('[data-template]');if(!card)return;if(editor.value.trim()&&!confirm('应用模板会替换当前内容，确认继续？'))return;const selected=templates.find(t=>t.id===card.dataset.template);editor.value=selected.content;titleInput.value=selected.name;replaceProjectImages({});templateDialog.close();update();toast(`已应用“${selected.name}”模板`);};
async function githubRequest(url,token,options={}){const response=await fetch(url,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});if(!response.ok){let detail='';try{detail=(await response.json()).message;}catch{}throw new Error(detail||`GitHub 返回 ${response.status}`);}return response.status===204?null:response.json();}
$('#pushBtn').onclick=async()=>{const token=$('#ghToken').value.trim(),owner=$('#ghOwner').value.trim(),repo=$('#ghRepo').value.trim(),branch=$('#ghBranch').value.trim(),path=$('#ghPath').value.trim().replace(/^\/+/,''),message=$('#ghMessage').value.trim(),feedback=$('#githubFeedback'),btn=$('#pushBtn');if(!token||!owner||!repo||!branch||!path)return feedback.textContent='请填写所有必填项。';btn.disabled=true;btn.textContent='正在提交…';feedback.textContent='';try{const api=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;let sha;try{sha=(await githubRequest(`${api}?ref=${encodeURIComponent(branch)}`,token)).sha;}catch(e){if(!String(e.message).includes('Not Found'))throw e;}const bytes=new TextEncoder().encode(editor.value);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));const result=await githubRequest(api,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,content:btoa(binary),branch,...(sha?{sha}:{})})});feedback.style.color='#587747';feedback.innerHTML=`提交成功：<a href="${result.content.html_url}" target="_blank" rel="noreferrer">在 GitHub 查看 ↗</a>`;toast('已保存到 GitHub');}catch(e){feedback.style.color='#a63b25';feedback.textContent=`提交失败：${e.message}`;}finally{btn.disabled=false;btn.textContent='提交到 GitHub';}};
async function initialize(){await ensureUniqueEditorSession();const localDraft=loadDocument();await loadRecoveryDraft(localDraft);resetEditorHistory();}
initialize();
function astInline(tokens=[]){return tokens.map(token=>{switch(token.type){case'text':return token.tokens?astInline(token.tokens):mdInline(token.text);case'strong':return `\\textbf{${astInline(token.tokens)}}`;case'em':return `\\textit{${astInline(token.tokens)}}`;case'del':return `\\sout{${astInline(token.tokens)}}`;case'codespan':return `\\texttt{${latexEscape(token.text)}}`;case'link':return `\\href{${token.href}}{${astInline(token.tokens)}}`;case'image':return `\\href{${token.href}}{[图片：${latexEscape(token.text||token.href)}]}`;case'br':return '\\\\\n';default:return token.raw?mdInline(token.raw):'';}}).join('');}
function renderAstList(token){const env=token.ordered?'enumerate':'itemize';const items=token.items.map(item=>{const parts=(item.tokens||[]).map(child=>child.type==='list'?renderAstList(child):child.type==='text'||child.type==='paragraph'?astInline(child.tokens||[{type:'text',text:child.text}]):renderAstBlocks([child],{title:null}));return `  \\item ${parts.join('\n')}`;}).join('\n');return `\\begin{${env}}\n${items}\n\\end{${env}}`;}
function renderAstTable(token){const format='@{}'+Array(token.header.length).fill('X').join(' ')+'@{}',cell=entry=>astInline(entry.tokens||[{type:'text',text:entry.text||''}]),header=token.header.map(cell).join(' & '),rows=token.rows.map(row=>row.map(cell).join(' & ')+' \\\\').join('\n');return `\\begin{table}[H]\n\\centering\n\\begin{tabularx}{\\textwidth}{${format}}\n\\toprule\n${header} \\\\ \n\\midrule\n${rows}\n\\bottomrule\n\\end{tabularx}\n\\end{table}`;}
function renderAstBlocks(tokens,state){const result=[],headingCommands=['section','subsection','subsubsection','paragraph','subparagraph'];for(const token of tokens){switch(token.type){case'space':break;case'heading':{const value=astInline(token.tokens);if(token.depth===1&&!state.title){state.title=token.text;break;}const command=headingCommands[Math.max(0,Math.min(token.depth-2,headingCommands.length-1))];result.push(`\\${command}{${value}}`);break;}case'paragraph':case'text':result.push(astInline(token.tokens||[{type:'text',text:token.text}]));break;case'list':result.push(renderAstList(token));break;case'blockquote':result.push(`\\begin{quote}\n${renderAstBlocks(token.tokens,state)}\n\\end{quote}`);break;case'code':result.push(`\\begin{verbatim}\n${token.text}\n\\end{verbatim}`);break;case'table':result.push(renderAstTable(token));break;case'hr':result.push('\\par\\medskip\\hrule\\medskip');break;case'html':{const value=token.raw.replace(/<[^>]+>/g,'').trim();if(value)result.push(latexEscape(value));break;}default:if(token.tokens)result.push(renderAstBlocks(token.tokens,state));}}return result.filter(Boolean).join('\n\n');}
function smartMarkdownToLatex(markdown,fallbackTitle='Markdown 笔记'){if(!window.marked?.lexer)return markdownToLatex(markdown);const state={title:null},body=renderAstBlocks(window.marked.lexer(markdown,{gfm:true}),state),title=state.title||fallbackTitle;let preamble=defaultDocument.slice(0,defaultDocument.indexOf('\\begin{document}'));preamble=preamble.replace(/\\title\{[^}]*\}/,`\\title{${latexEscape(title)}}`).replace('\\usepackage{enumitem,fancyhdr,hyperref,microtype}','\\usepackage{enumitem,fancyhdr,hyperref,microtype,ulem}');return {title,content:`${preamble}\\begin{document}\n\\maketitle\n\\tableofcontents\n\\newpage\n\n${body}\n\n\\end{document}`};}
const legacyMarkdownParser=markdownToLatex;
markdownToLatex=(markdown)=>{const result=window.marked?.lexer?smartMarkdownToLatex(markdown):legacyMarkdownParser(markdown);result.content=result.content.replace(/\\author\{[^}]*\}/,'\\author{}');return result;};
const formulaLibrary=[
  ['基础','上标与下标',String.raw`x_i^2 + a_{n+1}`,false,'上下标 索引 次方'],
  ['基础','分式',String.raw`\frac{a+b}{c+d}`,false,'分数 除法'],
  ['基础','根式',String.raw`\sqrt{x} + \sqrt[n]{x}`,false,'平方根 n次根'],
  ['基础','绝对值与范数',String.raw`|x|,\quad \lVert \mathbf{x} \rVert_2`,false,'绝对值 模长 范数'],
  ['基础','上下括号',String.raw`\left( \frac{a}{b} \right),\quad \left[ x \right]`,false,'括号 自动大小'],
  ['希腊字母','常用小写',String.raw`\alpha,\beta,\gamma,\delta,\epsilon,\theta,\lambda,\mu,\pi,\sigma,\phi,\omega`,true,'希腊 字母'],
  ['希腊字母','常用大写',String.raw`\Gamma,\Delta,\Theta,\Lambda,\Pi,\Sigma,\Phi,\Omega`,true,'希腊 大写'],
  ['微积分','极限',String.raw`\lim_{x \to a} f(x) = L`,true,'limit 趋近'],
  ['微积分','导数',String.raw`f'(x)=\frac{\mathrm{d}f}{\mathrm{d}x}`,true,'微分 derivative'],
  ['微积分','偏导数',String.raw`\frac{\partial f}{\partial x_i}`,true,'偏微分 partial'],
  ['微积分','定积分',String.raw`\int_a^b f(x)\,\mathrm{d}x`,true,'积分 integral'],
  ['微积分','多重积分',String.raw`\iint_D f(x,y)\,\mathrm{d}x\,\mathrm{d}y`,true,'二重积分'],
  ['微积分','梯度',String.raw`\nabla f(\mathbf{x})=\begin{bmatrix}\partial f/\partial x_1 & \cdots & \partial f/\partial x_n\end{bmatrix}^{\!T}`,true,'梯度 gradient nabla'],
  ['求和','求和',String.raw`\sum_{i=1}^{n} x_i`,true,'sum 累加'],
  ['求和','连乘',String.raw`\prod_{i=1}^{n} x_i`,true,'product 累乘'],
  ['求和','无穷级数',String.raw`\sum_{n=0}^{\infty} \frac{x^n}{n!}=e^x`,true,'无穷 级数 series'],
  ['线性代数','向量',String.raw`\mathbf{x}=\begin{bmatrix}x_1 & x_2 & \cdots & x_n\end{bmatrix}^{T}`,true,'vector 向量'],
  ['线性代数','矩阵',String.raw`A=\begin{bmatrix}a_{11}&a_{12}\\a_{21}&a_{22}\end{bmatrix}`,true,'matrix 矩阵'],
  ['线性代数','行列式',String.raw`\det(A)=\begin{vmatrix}a&b\\c&d\end{vmatrix}=ad-bc`,true,'det determinant 行列式'],
  ['线性代数','特征值',String.raw`A\mathbf{v}=\lambda\mathbf{v}`,true,'eigenvalue 特征向量'],
  ['线性代数','矩阵分解',String.raw`A=U\Sigma V^{T}`,true,'SVD 奇异值分解'],
  ['方程','对齐方程',String.raw`\begin{aligned}a+b&=c\\x+y&=z\end{aligned}`,true,'align 多行 对齐'],
  ['方程','方程组',String.raw`\begin{cases}2x+y=5\\x-y=1\end{cases}`,true,'cases 联立 方程组'],
  ['方程','分段函数',String.raw`f(x)=\begin{cases}x^2,&x\ge 0\\-x,&x<0\end{cases}`,true,'piecewise 分段'],
  ['集合逻辑','集合运算',String.raw`A \cup B,\quad A \cap B,\quad A \setminus B,\quad A \subseteq B`,true,'集合 并集 交集 子集'],
  ['集合逻辑','数集',String.raw`\mathbb{N}\subset\mathbb{Z}\subset\mathbb{Q}\subset\mathbb{R}\subset\mathbb{C}`,true,'自然数 整数 实数 复数'],
  ['集合逻辑','量词与逻辑',String.raw`\forall x\in A,\ \exists y\in B:\ P(x)\Rightarrow Q(y)`,true,'任意 存在 推出'],
  ['集合逻辑','映射',String.raw`f:A\to B,\quad x\mapsto f(x)`,true,'函数 map 映射'],
  ['概率统计','条件概率',String.raw`P(A\mid B)=\frac{P(A\cap B)}{P(B)}`,true,'probability 条件概率'],
  ['概率统计','期望与方差',String.raw`\mathbb{E}[X]=\sum_x xP(X=x),\quad \operatorname{Var}(X)=\mathbb{E}[(X-\mu)^2]`,true,'expectation variance 期望 方差'],
  ['概率统计','正态分布',String.raw`f(x)=\frac{1}{\sigma\sqrt{2\pi}}\exp\!\left(-\frac{(x-\mu)^2}{2\sigma^2}\right)`,true,'normal gaussian 高斯'],
  ['概率统计','贝叶斯公式',String.raw`P(A\mid B)=\frac{P(B\mid A)P(A)}{P(B)}`,true,'Bayes 贝叶斯'],
  ['优化','最优化问题',String.raw`\min_{\mathbf{x}}\ f(\mathbf{x})\quad\text{s.t.}\quad g_i(\mathbf{x})\le 0`,true,'optimization 最小化 约束'],
  ['优化','Argmin',String.raw`\mathbf{x}^{*}=\operatorname*{arg\,min}_{\mathbf{x}\in\mathcal{X}} f(\mathbf{x})`,true,'argmin 最优解'],
  ['常用符号','关系符号',String.raw`a\ne b,\ a\approx b,\ a\le b,\ a\ge b,\ a\propto b`,true,'不等 约等 小于 大于 正比'],
  ['常用符号','箭头',String.raw`A\to B,\ A\Rightarrow B,\ A\leftrightarrow B,\ A\Longrightarrow B`,true,'arrow 箭头 推导'],
  ['常用符号','省略号',String.raw`a_1,a_2,\ldots,a_n\qquad \vdots\qquad \ddots`,true,'dots 省略号'],
  ['常用符号','文本标注',String.raw`f(x)=0\quad\text{当且仅当}\quad x=0`,true,'公式文字 text'],
];
const formulaDialog=$('#formulaDialog'),formulaGrid=$('#formulaGrid'),formulaSearch=$('#formulaSearch');let formulaCategory='全部';
function insertFormula(tex,display=true){const value=display?`\n\\[\n  ${tex}\n\\]\n`:`$${tex}$`,start=editor.selectionStart;editor.setRangeText(value,start,editor.selectionEnd,'end');editor.focus();update();formulaDialog.close();toast(display?'已插入独立公式':'已插入行内公式');}
function drawFormulaGuide(){const query=formulaSearch.value.trim().toLowerCase(),items=formulaLibrary.filter(([cat,name,tex,,keywords])=>(formulaCategory==='全部'||cat===formulaCategory)&&(!query||`${cat} ${name} ${tex} ${keywords}`.toLowerCase().includes(query)));formulaGrid.innerHTML=items.length?items.map(([cat,name,tex,display],index)=>`<button class="formula-card" data-formula-index="${formulaLibrary.indexOf(items[index])}"><span class="formula-name"><b>${escapeHtml(name)}</b><i>${cat} · ${display?'独立':'行内'}</i></span><span class="formula-render">${renderMath(tex,display)}</span><code>${escapeHtml(tex)}</code></button>`).join(''):'<div class="formula-empty">没有找到相关公式，试试在下方输入自定义公式。</div>';}
const formulaCats=['全部',...new Set(formulaLibrary.map(item=>item[0]))];$('#formulaCategories').innerHTML=formulaCats.map(cat=>`<button data-formula-category="${cat}" class="${cat==='全部'?'active':''}">${cat}</button>`).join('');
function openFormulaGuide(){drawFormulaGuide();formulaDialog.showModal();setTimeout(()=>formulaSearch.focus(),50);} $('#formulaGuideBtn').onclick=openFormulaGuide;$('#formulaToolbarBtn').onclick=openFormulaGuide;$('[data-formula-close]').onclick=()=>formulaDialog.close();formulaSearch.oninput=drawFormulaGuide;
$('#formulaCategories').onclick=e=>{const button=e.target.closest('[data-formula-category]');if(!button)return;formulaCategory=button.dataset.formulaCategory;document.querySelectorAll('[data-formula-category]').forEach(x=>x.classList.toggle('active',x===button));drawFormulaGuide();};
formulaGrid.onclick=e=>{const card=e.target.closest('[data-formula-index]');if(!card)return;const item=formulaLibrary[Number(card.dataset.formulaIndex)];insertFormula(item[2],item[3]);};
function updateCustomFormula(){const tex=$('#customFormula').value;$('#customFormulaPreview').innerHTML=renderMath(tex,false);} $('#customFormula').oninput=updateCustomFormula;$('#insertCustomFormula').onclick=()=>insertFormula($('#customFormula').value,true);$('#insertNumberedFormula').onclick=()=>{insertNumberedEquation($('#customFormula').value);formulaDialog.close();};updateCustomFormula();
window.addEventListener('folio:dependency-ready',()=>{mathRenderCache.clear();inlineRenderCache.clear();renderBackendRevision++;update(false,{forceRender:true});updateCustomFormula();if(formulaDialog.open)drawFormulaGuide();});
if(location.hash==='#formulas')setTimeout(openFormulaGuide,500);
