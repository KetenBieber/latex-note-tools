const $ = (selector) => document.querySelector(selector);
const editor = $('#editor');
const preview = $('#preview');
const titleInput = $('#documentTitle');
const storageKey = 'folio-latex-document-v1';
const defaultDocument = String.raw`\documentclass[11pt,a4paper]{ctexart}
\usepackage{amsmath,amssymb,amsthm,mathtools}
\usepackage[most]{tcolorbox}
\usepackage{graphicx,float,booktabs,tabularx}
\usepackage{enumitem,fancyhdr,hyperref,microtype}
\usepackage[margin=2.4cm]{geometry}

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

let saveTimer, renderTimer, zoom = 1;
let projectImages = {};
const templates = [
  { id:'daily', icon:'☀', name:'每日笔记', description:'今日重点、灵感、任务与复盘', content:String.raw`\documentclass{article}
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

function loadDocument() {
  try { const saved=JSON.parse(localStorage.getItem(storageKey)); editor.value=saved?.content || defaultDocument; titleInput.value=saved?.name || '我的第一份 LaTeX 笔记'; }
  catch { editor.value=defaultDocument; }
  update();
}
function persist() {
  localStorage.setItem(storageKey, JSON.stringify({name:titleInput.value,content:editor.value,updatedAt:new Date().toISOString()}));
  $('#saveStatus').innerHTML='<i></i> 已保存';
}
function openRecoveryDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('folio-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function saveRecoveryDraft(){try{const db=await openRecoveryDb();await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({name:titleInput.value,content:editor.value,images:projectImages,updatedAt:Date.now()},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch{/* localStorage 文字草稿仍然可用 */}}
async function loadRecoveryDraft(){try{const db=await openRecoveryDb();const draft=await new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').get('current');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();if(draft?.content){editor.value=draft.content;titleInput.value=draft.name||titleInput.value;projectImages=draft.images||{};update();}}catch{/* 使用 localStorage 降级 */}}
function scheduleSave() { $('#saveStatus').innerHTML='<i style="background:#d49b43"></i> 保存中…'; clearTimeout(saveTimer); saveTimer=setTimeout(()=>{persist();saveRecoveryDraft();},450); }
function renderMath(tex, displayMode=false) {
  if (!window.katex) return `<span>${escapeHtml(tex)}</span>`;
  try { return window.katex.renderToString(tex,{displayMode,throwOnError:true,strict:false,trust:false}); }
  catch (e) { return `<span class="render-error" title="${escapeHtml(e.message)}">${escapeHtml(tex)}</span>`; }
}
function inline(text) {
  let safe=escapeHtml(text);
  const unescapeLatex=value=>value.replace(/\\([_%&#$])/g,'$1').replace(/\\textasciitilde\{\}/g,'~').replace(/\\textasciicircum\{\}/g,'^');
  safe=safe.replace(/\\texttt\{([^{}]*)\}/g,(_,x)=>`<code class="inline-code">${unescapeLatex(x)}</code>`)
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
  return unescapeLatex(safe);
}
function compile(source) {
  let body=source.replace(/^[\s\S]*?\\begin\{document\}/,'').replace(/\\end\{document\}[\s\S]*$/,'');
  const title=source.match(/\\title\{([^}]*)\}/)?.[1]; const author=source.match(/\\author\{([^}]*)\}/)?.[1];
  body=body.replace(/\\maketitle/g, title?`<h1>${inline(title)}</h1>${author?`<div class="author">${inline(author)}</div>`:''}`:'');
  body=body.replace(/\\tableofcontents\b/g,'').replace(/\\(?:newpage|clearpage|pagebreak)\b/g,'');
  body=body.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g,(_,x)=>`<div class="abstract">${inline(x.trim())}</div>`);
  body=body.replace(/\\begin\{(theorem|proof)\}([\s\S]*?)\\end\{\1\}/g,(_,type,x)=>`<div class="theorem"><strong>${type==='proof'?'证明':'定理'}.</strong> ${inline(x.trim())}</div>`);
  const boxNames={defbox:'定义',thmbox:'定理',exbox:'例题',whybox:'直觉',sumbox:'总结'};
  body=body.replace(/\\begin\{(defbox|thmbox|exbox|whybox|sumbox)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g,(_,type,label,x)=>`<div class="theorem cmu-box ${type}"><strong>${boxNames[type]}${label?`：${inline(label)}`:''}</strong><br>${inline(x.trim())}</div>`);
  body=body.replace(/\\begin\{(verbatim|lstlisting)\}([\s\S]*?)\\end\{\1\}/g,(_,__,x)=>`<pre>${escapeHtml(x.trim())}</pre>`);
  body=body.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g,(_,x)=>`<blockquote>${inline(x.trim())}</blockquote>`);
  body=body.replace(/\\begin\{table\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{table\}/g,(_,table)=>{const content=table.match(/\\begin\{tabularx\}\{[^}]+\}\{[^}]+\}([\s\S]*?)\\end\{tabularx\}/)?.[1];if(!content)return '';const clean=content.replace(/\\(toprule|midrule|bottomrule)\b/g,''),rows=clean.split(/\\\\/).map(row=>row.trim()).filter(Boolean),html=rows.map((row,i)=>`<tr>${row.split('&').map(cell=>`<${i===0?'th':'td'}>${inline(cell.trim())}</${i===0?'th':'td'}>`).join('')}</tr>`).join('');return `<div class="table-scroll"><table>${html}</table></div>`;});
  body=body.replace(/\\par\\medskip\\hrule\\medskip/g,'<hr>');
  body=body.replace(/\\begin\{figure\}(?:\[[^\]]*\])?/g,'').replace(/\\end\{figure\}/g,'').replace(/\\centering\b/g,'').replace(/\\label\{[^}]+\}/g,'');
  body=body.replace(/\\includegraphics(?:\[width=([^\]]+)\])?\{([^}]+)\}\s*(?:\\caption\{([^}]+)\})?/g,(_,width,name,caption)=>{const key=name.replace(/^images\//,'');const src=projectImages[key]||projectImages[name];const percent=width?.match(/([\d.]+)\\textwidth/)?.[1];if(!src)return `<div class="render-error">图片已写入项目：${escapeHtml(name)}（真实编译后显示）</div>`;return `<figure><img src="${src}" alt="${escapeHtml(caption||name)}" style="width:${percent?Number(percent)*100:100}%">${caption?`<figcaption>${inline(caption)}</figcaption>`:''}</figure>`;});
  body=body.replace(/\\\[([\s\S]*?)\\\]/g,(_,x)=>`<span class="display-math">${renderMath(x.trim(),true)}</span>`).replace(/\$\$([\s\S]*?)\$\$/g,(_,x)=>`<span class="display-math">${renderMath(x.trim(),true)}</span>`);
  body=body.replace(/\\section\*?\{([^}]*)\}/g,(_,x)=>`<h2>${inline(x)}</h2>`).replace(/\\subsection\*?\{([^}]*)\}/g,(_,x)=>`<h3>${inline(x)}</h3>`);
  body=body.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g,(_,type,x)=>{const tag=type==='enumerate'?'ol':'ul';const items=x.split(/\\item\s*/).filter(Boolean).map(i=>`<li>${inline(i.trim())}</li>`).join('');return `<${tag}>${items}</${tag}>`;});
  body=body.replace(/^\s*%.*$/gm,'').replace(/\\(documentclass|usepackage|date)(?:\[[^\]]*\])?\{[^}]*\}/g,'');
  const htmlBlocks=[];
  body=body.replace(/<(h[1-6]|div|ul|ol|pre|figure|blockquote|table)(?:\s[^>]*)?>[\s\S]*?<\/\1>|<hr(?:\s[^>]*)?>/gi,html=>{htmlBlocks.push(html);return `@@FOLIOHTML${htmlBlocks.length-1}@@`;});
  const restoreHtml=value=>value.replace(/@@FOLIOHTML(\d+)@@/g,(_,i)=>htmlBlocks[Number(i)]);
  return body.split(/\n\s*\n/).map(block=>{const value=block.trim();if(!value)return '';if(/^(?:@@FOLIOHTML\d+@@\s*)+$/.test(value))return restoreHtml(value);return restoreHtml(`<p>${inline(value).replace(/\n/g,'<br>')}</p>`);}).join('').replace(/<p>\s*<\/p>/g,'');
}
function update() {
  const lines=editor.value.split('\n'); $('#lineNumbers').textContent=lines.map((_,i)=>i+1).join('\n'); $('#lineCount').textContent=`${lines.length} 行`;
  clearTimeout(renderTimer); $('#compileStatus').textContent='正在排版…';
  renderTimer=setTimeout(()=>{ preview.innerHTML=compile(editor.value); buildSourceMap(); $('#compileStatus').textContent='即时排版 · 双向定位'; },100);
  scheduleSave();
}
editor.addEventListener('input',update); titleInput.addEventListener('input',scheduleSave);
editor.addEventListener('scroll',()=>{$('#lineNumbers').scrollTop=editor.scrollTop;});
function syncText(value){return value.toLowerCase().replace(/\\(?:begin|end)\{[^}]+\}/g,' ').replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g,' ').replace(/[{}\[\]$\\^_&%#*`~|=:：，。；、（）()<>\s\-]+/g,'');}
function sourceLineText(line){return syncText(line.replace(/(?<!\\)%.*$/,'').replace(/\\item\b/g,'').replace(/\\(?:label|pagestyle|lhead|rhead|cfoot)\{[^}]*\}/g,''));}
function previewNodeText(node){const copy=node.cloneNode(true);copy.querySelectorAll('.katex-mathml').forEach(x=>x.remove());return syncText(copy.textContent||'');}
function similarity(a,b){if(!a||!b)return 0;if(a.includes(b)||b.includes(a))return 30+Math.min(a.length,b.length);if(a.length<3||b.length<3)return 0;const small=a.length<=b.length?a:b,large=a.length<=b.length?b:a;let hits=0;for(let i=0;i<small.length-1;i++)if(large.includes(small.slice(i,i+2)))hits++;return hits/Math.max(1,small.length-1)*10;}
function buildSourceMap(){const lines=editor.value.split('\n'),lineData=lines.map((line,index)=>({line:index+1,text:sourceLineText(line)})),nodes=[...preview.querySelectorAll('h1,h2,h3,p,li,blockquote,.theorem,.display-math,figcaption,pre,td,th')];let floor=0;for(const node of nodes){const text=previewNodeText(node);if(!text)continue;let best=null,bestScore=0;for(let i=Math.max(0,floor-3);i<lineData.length;i++){const score=similarity(text,lineData[i].text)+(i>=floor?0.5:0);if(score>bestScore){bestScore=score;best=lineData[i];}}if(best&&bestScore>=3){node.dataset.sourceLine=String(best.line);node.title=`点击定位到源码第 ${best.line} 行`;floor=Math.max(floor,best.line-1);}}}
function highlightPreviewNode(node,scroll=true){preview.querySelectorAll('.source-sync-highlight').forEach(x=>x.classList.remove('source-sync-highlight'));if(!node)return;node.classList.add('source-sync-highlight');if(scroll)node.scrollIntoView({behavior:'smooth',block:'center'});}
function clearPreviewTextHighlights(){preview.querySelectorAll('mark.source-word-highlight').forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent)));preview.normalize();}
function highlightPreviewText(node,raw){clearPreviewTextHighlights();const needle=raw.trim();if(!needle||needle.length>160)return false;const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),textNodes=[];let current;while((current=walker.nextNode()))textNodes.push(current);for(const textNode of textNodes){const index=textNode.data.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());if(index<0)continue;const mark=document.createElement('mark');mark.className='source-word-highlight';const after=textNode.splitText(index),tail=after.splitText(needle.length);after.replaceWith(mark);mark.append(after);mark.scrollIntoView({behavior:'smooth',block:'center'});return true;}return false;}
function editorLineAtCursor(){return editor.value.slice(0,editor.selectionStart).split('\n').length;}
function syncPreviewFromEditor(){clearPreviewTextHighlights();const line=editorLineAtCursor(),documentLine=editor.value.slice(0,editor.value.indexOf('\\begin{document}')).split('\n').length;if(line<documentLine){highlightPreviewNode(null,false);$('#compileStatus').textContent=`源码 ${line} 行 · 导言区无正文定位`;return;}const nodes=[...preview.querySelectorAll('[data-source-line]')];if(!nodes.length)return;let nearest=nodes[0],distance=Infinity;for(const node of nodes){const current=Math.abs(Number(node.dataset.sourceLine)-line);if(current<distance){distance=current;nearest=node;}}highlightPreviewNode(nearest,true);$('#compileStatus').textContent=`源码 ${line} 行 → 预览`;}
function locateSelectedSource(){const raw=editor.value.slice(editor.selectionStart,editor.selectionEnd).trim();if(!raw){syncPreviewFromEditor();return;}const selected=syncText(raw),nodes=[...preview.querySelectorAll('[data-source-line]')];let best=null,bestScore=0;for(const node of nodes){const score=similarity(selected,previewNodeText(node));if(score>bestScore){bestScore=score;best=node;}}if(best&&bestScore>=3){highlightPreviewNode(best,!highlightPreviewText(best,raw));$('#compileStatus').textContent=`“${raw.slice(0,18)}${raw.length>18?'…':''}” → 预览`;}else{$('#compileStatus').textContent='未找到所选文字的预览位置';toast('右侧预览中没有找到这段文字');}}
function selectSource(line,startOffset=null,endOffset=null,bringIntoView=false){const lines=editor.value.split('\n');let lineStart=0;for(let i=0;i<line-1;i++)lineStart+=lines[i].length+1;const start=startOffset??lineStart,end=endOffset??lineStart+(lines[line-1]?.length||0);editor.focus();editor.setSelectionRange(start,end);const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||22;editor.scrollTop=Math.max(0,(line-4)*lineHeight);$('#lineNumbers').scrollTop=editor.scrollTop;if(bringIntoView&&matchMedia('(max-width:1100px)').matches)document.querySelector('.editor-pane').scrollIntoView({behavior:'smooth',block:'start'});}
function findSourceOccurrenceNear(text,line){if(!text)return-1;const source=editor.value,lineOffset=source.split('\n').slice(0,Math.max(0,line-1)).reduce((sum,item)=>sum+item.length+1,0);let match=source.indexOf(text),best=-1,distance=Infinity;while(match>=0){const nextDistance=Math.abs(match-lineOffset);if(nextDistance<distance){best=match;distance=nextDistance;}match=source.indexOf(text,match+Math.max(1,text.length));}return best;}
editor.addEventListener('dblclick',()=>setTimeout(locateSelectedSource,0));
editor.addEventListener('click',syncPreviewFromEditor);
const sourceLocateBtn=$('#sourceLocateBtn');
sourceLocateBtn.addEventListener('mousedown',e=>e.preventDefault());
sourceLocateBtn.onclick=()=>{locateSelectedSource();editor.focus({preventScroll:true});};
let previewClickTimer;
preview.addEventListener('click',e=>{const node=e.target.closest('[data-source-line]');if(!node)return;clearTimeout(previewClickTimer);previewClickTimer=setTimeout(()=>{const line=Number(node.dataset.sourceLine);clearPreviewTextHighlights();selectSource(line);highlightPreviewNode(node,false);$('#compileStatus').textContent=`预览 → 源码 ${line} 行`;},240);});
preview.addEventListener('dblclick',e=>{clearTimeout(previewClickTimer);const node=e.target.closest('[data-source-line]');if(!node)return;const chosen=window.getSelection()?.toString().trim()||'',source=editor.value,lineHint=Number(node.dataset.sourceLine);e.preventDefault();let start=findSourceOccurrenceNear(chosen,lineHint);if(start<0&&chosen){const wanted=syncText(chosen),lines=source.split('\n');let bestLine=lineHint,bestScore=0;for(let i=0;i<lines.length;i++){const score=similarity(wanted,sourceLineText(lines[i]));if(score>bestScore){bestScore=score;bestLine=i+1;}}selectSource(bestLine,null,null,true);$('#compileStatus').textContent=`“${chosen.slice(0,18)}” → 源码 ${bestLine} 行`;}else if(start>=0){const line=source.slice(0,start).split('\n').length;selectSource(line,start,start+chosen.length,true);$('#compileStatus').textContent=`已选中源码“${chosen.slice(0,18)}${chosen.length>18?'…':''}”`;}else{selectSource(lineHint,null,null,true);}});
editor.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const s=editor.selectionStart;editor.setRangeText('  ',s,editor.selectionEnd,'end');update();}if(e.altKey&&e.key==='Enter'){e.preventDefault();locateSelectedSource();}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();saveProjectZip();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();persist();saveRecoveryDraft();toast('恢复草稿已保存');}});
document.querySelectorAll('[data-insert],[data-wrap]').forEach(btn=>btn.addEventListener('click',()=>{const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end);let value=btn.dataset.insert;if(btn.dataset.wrap){const [before,after]=btn.dataset.wrap.split('|');value=before+selected+after;}editor.setRangeText(value,start,end,'end');editor.focus();update();}));
$('#openBtn').onclick=()=>$('#fileInput').click();
$('#importMdBtn').onclick=()=>$('#fileInput').click();
function latexEscape(text){return text.replace(/([%&#_{}])/g,'\\$1').replace(/~/g,'\\textasciitilde{}').replace(/\^/g,'\\textasciicircum{}');}
function mdInline(text){const saved=[];const hold=value=>{saved.push(value);return `@@FOLIO${saved.length-1}@@`;};let out=text.replace(/`([^`]+)`/g,(_,x)=>hold(`\\texttt{${latexEscape(x)}}`)).replace(/\$([^$\n]+)\$/g,(_,x)=>hold(`$${x}$`)).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,url)=>hold(`\\href{${url}}{[图片：${latexEscape(alt||url)}]}`)).replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>hold(`\\href{${url}}{${latexEscape(label)}}`));out=latexEscape(out).replace(/\*\*([^*]+)\*\*/g,'\\textbf{$1}').replace(/__([^_]+)__/g,'\\textbf{$1}').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'\\textit{$1}');return out.replace(/@@FOLIO(\d+)@@/g,(_,i)=>saved[Number(i)]);}
function markdownToLatex(markdown){const lines=markdown.replace(/\r/g,'').split('\n');let title='Markdown 笔记',body=[],list=null,inCode=false,code=[];const closeList=()=>{if(list){body.push(`\\end{${list}}`);list=null;}};for(let i=0;i<lines.length;i++){const line=lines[i];if(/^```/.test(line)){if(inCode){body.push('\\begin{verbatim}\n'+code.join('\n')+'\n\\end{verbatim}');code=[];inCode=false;}else{closeList();inCode=true;}continue;}if(inCode){code.push(line);continue;}const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){closeList();const level=heading[1].length,text=heading[2].trim();if(level===1&&title==='Markdown 笔记')title=text;else body.push(`${level<=2?'\\section':level===3?'\\subsection':'\\subsubsection'}{${mdInline(text)}}`);continue;}if(/^\s*[-*_]{3,}\s*$/.test(line)){closeList();body.push('\\hrulefill');continue;}const bullet=line.match(/^\s*[-+*]\s+(.+)$/),numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);if(bullet||numbered){const wanted=bullet?'itemize':'enumerate';if(list!==wanted){closeList();list=wanted;body.push(`\\begin{${list}}`);}body.push(`  \\item ${mdInline((bullet||numbered)[1])}`);continue;}closeList();const quote=line.match(/^>\s?(.*)$/);if(quote){body.push(`\\begin{whybox}\n${mdInline(quote[1])}\n\\end{whybox}`);continue;}if(/^\s*\$\$\s*$/.test(line)){const math=[];i++;while(i<lines.length&&!/^\s*\$\$\s*$/.test(lines[i]))math.push(lines[i++]);body.push('\\[\n'+math.join('\n')+'\n\\]');continue;}body.push(line.trim()?mdInline(line):'');}closeList();if(inCode)body.push('\\begin{verbatim}\n'+code.join('\n')+'\n\\end{verbatim}');let preamble=defaultDocument.slice(0,defaultDocument.indexOf('\\begin{document}'));preamble=preamble.replace(/\\title\{[^}]*\}/,`\\title{${latexEscape(title)}}`);return {title,content:`${preamble}\\begin{document}\n\\maketitle\n\\tableofcontents\n\\newpage\n\n${body.join('\n')}\n\n\\end{document}`};}
$('#fileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.name.toLowerCase().endsWith('.zip')){const files=await readZip(new Uint8Array(await file.arrayBuffer()));const tex=files.get('main.tex')||[...files].find(([name])=>name.endsWith('/main.tex'))?.[1];if(!tex)throw new Error('ZIP 中找不到 main.tex');editor.value=new TextDecoder().decode(tex);projectImages={};for(const [name,data] of files){const marker=name.lastIndexOf('/images/'),isRoot=name.startsWith('images/');if(!isRoot&&marker<0)continue;const short=isRoot?name.slice(7):name.slice(marker+8);if(!short||short.endsWith('/'))continue;projectImages[short]=`data:${mimeFor(name)};base64,${bytesToBase64(data)}`;}titleInput.value=file.name.replace(/\.zip$/i,'');}else if(/\.(md|markdown)$/i.test(file.name)){const converted=markdownToLatex(await file.text());editor.value=converted.content;titleInput.value=converted.title;projectImages={};toast('Markdown 已转换为 CMU LaTeX 模板');}else{editor.value=await file.text();titleInput.value=file.name.replace(/\.tex$/i,'');projectImages={};}update();if(!/\.(md|markdown)$/i.test(file.name))toast(`已打开 ${file.name}`);}catch(err){toast(`无法打开项目：${err.message}`);}e.target.value='';};
$('#downloadBtn').onclick=()=>{const blob=new Blob([editor.value],{type:'text/x-tex;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(titleInput.value.trim()||'note').replace(/[\\/:*?"<>|]/g,'-')+'.tex';a.click();URL.revokeObjectURL(a.href);toast('已下载 .tex 文件');};
function crc32(data){let crc=-1;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
function makeZip(entries){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;for(const [name,value] of entries){const filename=enc.encode(name),data=value instanceof Uint8Array?value:enc.encode(value),crc=crc32(data);const local=new Uint8Array(30+filename.length+data.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,filename.length,true);local.set(filename,30);local.set(data,30+filename.length);locals.push(local);const central=new Uint8Array(46+filename.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);central.set(filename,46);centrals.push(central);offset+=local.length;}const centralSize=centrals.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...locals,...centrals,end],{type:'application/zip'});}
async function readZip(bytes){const out=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();let eocd=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}}if(eocd<0)throw new Error('不是有效的 ZIP 项目');const count=view.getUint16(eocd+10,true);let p=view.getUint32(eocd+16,true);for(let i=0;i<count;i++){if(view.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 目录损坏');const method=view.getUint16(p+10,true),compressed=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),localOffset=view.getUint32(p+42,true),name=dec.decode(bytes.slice(p+46,p+46+nameLen)),localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLen+localExtraLen,chunk=bytes.slice(start,start+compressed);let data;if(method===0)data=chunk;else if(method===8&&'DecompressionStream' in window){const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));data=new Uint8Array(await new Response(stream).arrayBuffer());}else throw new Error(`不支持 ZIP 压缩方法 ${method}`);out.set(name,data);p+=46+nameLen+extraLen+commentLen;}return out;}
const bytesToBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const mimeFor=name=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'}[name.split('.').pop().toLowerCase()]||'application/octet-stream');
async function saveProjectZip(){const entries=[['main.tex',editor.value],['README.txt','Open main.tex with any LaTeX editor or upload this ZIP to Overleaf.\nImages are stored in images/.\n']];for(const [name,url] of Object.entries(projectImages)){const encoded=url.split(',')[1]||'';entries.push([`images/${name}`,Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))]);}const blob=makeZip(entries),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(titleInput.value.trim()||'latex-notes').replace(/[\\/:*?"<>|]/g,'-')+'.zip';a.click();URL.revokeObjectURL(a.href);persist();await saveRecoveryDraft();toast(`标准 LaTeX ZIP 已保存（${Object.keys(projectImages).length} 张图片）`);}
$('#saveLocalBtn').onclick=saveProjectZip;
$('#imageBtn').onclick=()=>$('#imageInput').click();
function imageExtension(type='image/png'){return ({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'})[type]||'png';}
function uniqueImageName(original,type){const fallback=`pasted-${new Date().toISOString().replace(/[:.]/g,'-')}.${imageExtension(type)}`,source=(original&&original!=='image.png'?original:fallback).replace(/\s+/g,'-').replace(/[^\w\-.\u3400-\u9fff]/g,'-');let name=source,n=2;while(projectImages[name]){const dot=source.lastIndexOf('.');name=dot<0?`${source}-${n}`:`${source.slice(0,dot)}-${n}${source.slice(dot)}`;n++;}return name;}
function insertImageFile(file,preferredName){return new Promise(resolve=>{if(!file||!file.type.startsWith('image/'))return resolve(false);if(file.size>8*1024*1024){toast('单张图片请不要超过 8 MB');return resolve(false);}const reader=new FileReader();reader.onload=()=>{const name=uniqueImageName(preferredName||file.name,file.type);projectImages[name]=reader.result;const label=`fig:${Date.now().toString(36)}`,snippet=`\n\\begin{figure}[H]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{images/${name}}\n  \\caption{图片说明}\n  \\label{${label}}\n\\end{figure}\n`;editor.setRangeText(snippet,editor.selectionStart,editor.selectionEnd,'end');update();toast(`已插入 images/${name}`);resolve(true);};reader.onerror=()=>{toast('图片读取失败');resolve(false);};reader.readAsDataURL(file);});}
$('#imageInput').onchange=async e=>{const files=[...e.target.files];for(const file of files)await insertImageFile(file);e.target.value='';};
editor.addEventListener('paste',async e=>{const images=[...e.clipboardData.items].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(!images.length)return;e.preventDefault();for(const image of images)await insertImageFile(image,`pasted-${Date.now()}.${imageExtension(image.type)}`);});
$('#newBtn').onclick=()=>{if(editor.value!==defaultDocument&&!confirm('新建会替换当前编辑区，确认继续？'))return;editor.value=defaultDocument;titleInput.value='CMU 风格课程笔记';projectImages={};update();};
$('#printBtn').onclick=()=>window.print();
function setZoom(next){zoom=Math.min(1.4,Math.max(.6,next));preview.style.zoom=zoom;$('#zoomValue').textContent=Math.round(zoom*100)+'%';} $('#zoomIn').onclick=()=>setZoom(zoom+.1);$('#zoomOut').onclick=()=>setZoom(zoom-.1);
const divider=$('#divider'), left=$('.editor-pane'); divider.addEventListener('pointerdown',e=>{divider.setPointerCapture(e.pointerId);divider.classList.add('dragging');});divider.addEventListener('pointermove',e=>{if(!divider.hasPointerCapture(e.pointerId))return;left.style.width=Math.min(72,Math.max(28,e.clientX/window.innerWidth*100))+'%';});divider.addEventListener('pointerup',e=>{divider.releasePointerCapture(e.pointerId);divider.classList.remove('dragging');});

const dialog=$('#githubDialog'); $('#githubBtn').onclick=()=>{const file=(titleInput.value.trim()||'note').replace(/[\\/:*?"<>|]/g,'-')+'.tex';if($('#ghPath').value==='notes/note.tex')$('#ghPath').value='notes/'+file;dialog.showModal();}; $('[data-close]').onclick=()=>dialog.close();
const templateDialog=$('#templateDialog'), helpDialog=$('#helpDialog');
const zhihuDialog=$('#zhihuDialog');
$('#templateGrid').innerHTML=templates.map(t=>`<button class="template-card" data-template="${t.id}"><span class="template-icon">${t.icon}</span><strong>${t.name}</strong><small>${t.description}</small></button>`).join('');
$('#templateBtn').onclick=()=>templateDialog.showModal(); $('[data-template-close]').onclick=()=>templateDialog.close();
$('#helpBtn').onclick=()=>helpDialog.showModal(); $('[data-help-close]').onclick=()=>helpDialog.close();
$('#zhihuBtn').onclick=()=>zhihuDialog.showModal(); $('[data-zhihu-close]').onclick=()=>zhihuDialog.close();
function latexToZhihuMarkdown(source){let body=source.replace(/^[\s\S]*?\\begin\{document\}/,'').replace(/\\end\{document\}[\s\S]*$/,'').replace(/\\maketitle|\\tableofcontents|\\newpage/g,'');const labels={defbox:'定义',thmbox:'定理',exbox:'例题',whybox:'直觉',sumbox:'总结'};body=body.replace(/\\begin\{(defbox|thmbox|exbox|whybox|sumbox)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g,(_,type,label,x)=>`\n> **${labels[type]}${label?'：'+label:''}**\n> ${x.trim().replace(/\n/g,'\n> ')}\n`).replace(/\\begin\{(theorem|proof)\}([\s\S]*?)\\end\{\1\}/g,(_,type,x)=>`\n> **${type==='proof'?'证明':'定理'}** ${x.trim()}\n`);body=body.replace(/\\section\*?\{([^}]*)\}/g,'\n## $1\n').replace(/\\subsection\*?\{([^}]*)\}/g,'\n### $1\n').replace(/\\subsubsection\*?\{([^}]*)\}/g,'\n#### $1\n').replace(/\\textbf\{([^{}]*)\}/g,'**$1**').replace(/\\textit\{([^{}]*)\}|\\emph\{([^{}]*)\}/g,'*$1$2*').replace(/\\href\{([^{}]+)\}\{([^{}]+)\}/g,'[$2]($1)');body=body.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,(_,x)=>x.replace(/\\item\s*/g,'- ')).replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,(_,x)=>{let n=0;return x.replace(/\\item\s*/g,()=>`${++n}. `);});body=body.replace(/\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g,(_,x)=>{const name=x.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1]||'图片';const caption=x.match(/\\caption\{([^}]+)\}/)?.[1]||'';return `\n[请在知乎上传图片：${name}]${caption?'\n*'+caption+'*':''}\n`;});body=body.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g,'\n```\n$1\n```\n').replace(/\\(centering|hrulefill)\b|\\label\{[^}]+\}/g,'').replace(/^\s*%.*$/gm,'');return body.replace(/\n{3,}/g,'\n\n').trim();}
function downloadText(text,name,type='text/plain'){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
$('#downloadZhihuMd').onclick=()=>downloadText(`# ${titleInput.value}\n\n${latexToZhihuMarkdown(editor.value)}`,(titleInput.value||'知乎文章')+'.md','text/markdown');
$('#copyZhihuBtn').onclick=async()=>{const clone=preview.cloneNode(true);clone.querySelectorAll('.cmu-box,.theorem').forEach(box=>{const quote=document.createElement('blockquote');quote.innerHTML=box.innerHTML;box.replaceWith(quote);});const html=`<h1>${escapeHtml(titleInput.value)}</h1>${clone.innerHTML}`,plain=`${titleInput.value}\n\n${latexToZhihuMarkdown(editor.value)}`;try{if(window.ClipboardItem&&navigator.clipboard?.write){await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);}else{await navigator.clipboard.writeText(plain);}toast('已复制，请粘贴到知乎文章编辑器');zhihuDialog.close();}catch{const area=document.createElement('textarea');area.value=plain;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();toast('已复制 Markdown 文本');}};
$('#templateGrid').onclick=e=>{const card=e.target.closest('[data-template]');if(!card)return;if(editor.value.trim()&&!confirm('应用模板会替换当前内容，确认继续？'))return;const selected=templates.find(t=>t.id===card.dataset.template);editor.value=selected.content;titleInput.value=selected.name;projectImages={};templateDialog.close();update();toast(`已应用“${selected.name}”模板`);};
async function githubRequest(url,token,options={}){const response=await fetch(url,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});if(!response.ok){let detail='';try{detail=(await response.json()).message;}catch{}throw new Error(detail||`GitHub 返回 ${response.status}`);}return response.status===204?null:response.json();}
$('#pushBtn').onclick=async()=>{const token=$('#ghToken').value.trim(),owner=$('#ghOwner').value.trim(),repo=$('#ghRepo').value.trim(),branch=$('#ghBranch').value.trim(),path=$('#ghPath').value.trim().replace(/^\/+/,''),message=$('#ghMessage').value.trim(),feedback=$('#githubFeedback'),btn=$('#pushBtn');if(!token||!owner||!repo||!branch||!path)return feedback.textContent='请填写所有必填项。';btn.disabled=true;btn.textContent='正在提交…';feedback.textContent='';try{const api=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;let sha;try{sha=(await githubRequest(`${api}?ref=${encodeURIComponent(branch)}`,token)).sha;}catch(e){if(!String(e.message).includes('Not Found'))throw e;}const bytes=new TextEncoder().encode(editor.value);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));const result=await githubRequest(api,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,content:btoa(binary),branch,...(sha?{sha}:{})})});feedback.style.color='#587747';feedback.innerHTML=`提交成功：<a href="${result.content.html_url}" target="_blank" rel="noreferrer">在 GitHub 查看 ↗</a>`;toast('已保存到 GitHub');}catch(e){feedback.style.color='#a63b25';feedback.textContent=`提交失败：${e.message}`;}finally{btn.disabled=false;btn.textContent='提交到 GitHub';}};
async function initialize(){loadDocument();await loadRecoveryDraft();}
initialize();
function astInline(tokens=[]){return tokens.map(token=>{switch(token.type){case'text':return token.tokens?astInline(token.tokens):mdInline(token.text);case'strong':return `\\textbf{${astInline(token.tokens)}}`;case'em':return `\\textit{${astInline(token.tokens)}}`;case'del':return `\\sout{${astInline(token.tokens)}}`;case'codespan':return `\\texttt{${latexEscape(token.text)}}`;case'link':return `\\href{${token.href}}{${astInline(token.tokens)}}`;case'image':return `\\href{${token.href}}{[图片：${latexEscape(token.text||token.href)}]}`;case'br':return '\\\\\n';default:return token.raw?mdInline(token.raw):'';}}).join('');}
function renderAstList(token){const env=token.ordered?'enumerate':'itemize';const items=token.items.map(item=>{const parts=(item.tokens||[]).map(child=>child.type==='list'?renderAstList(child):child.type==='text'||child.type==='paragraph'?astInline(child.tokens||[{type:'text',text:child.text}]):renderAstBlocks([child],{title:null}));return `  \\item ${parts.join('\n')}`;}).join('\n');return `\\begin{${env}}\n${items}\n\\end{${env}}`;}
function renderAstTable(token){const format='@{}'+Array(token.header.length).fill('X').join(' ')+'@{}',cell=entry=>astInline(entry.tokens||[{type:'text',text:entry.text||''}]),header=token.header.map(cell).join(' & '),rows=token.rows.map(row=>row.map(cell).join(' & ')+' \\\\').join('\n');return `\\begin{table}[H]\n\\centering\n\\begin{tabularx}{\\textwidth}{${format}}\n\\toprule\n${header} \\\\ \n\\midrule\n${rows}\n\\bottomrule\n\\end{tabularx}\n\\end{table}`;}
function renderAstBlocks(tokens,state){const result=[];for(const token of tokens){switch(token.type){case'space':break;case'heading':{const value=astInline(token.tokens);if(token.depth===1&&!state.title){state.title=token.text;break;}const command=token.depth<=2?'section':token.depth===3?'subsection':'subsubsection';result.push(`\\${command}{${value}}`);break;}case'paragraph':case'text':result.push(astInline(token.tokens||[{type:'text',text:token.text}]));break;case'list':result.push(renderAstList(token));break;case'blockquote':result.push(`\\begin{quote}\n${renderAstBlocks(token.tokens,state)}\n\\end{quote}`);break;case'code':result.push(`\\begin{verbatim}\n${token.text}\n\\end{verbatim}`);break;case'table':result.push(renderAstTable(token));break;case'hr':result.push('\\par\\medskip\\hrule\\medskip');break;case'html':{const value=token.raw.replace(/<[^>]+>/g,'').trim();if(value)result.push(latexEscape(value));break;}default:if(token.tokens)result.push(renderAstBlocks(token.tokens,state));}}return result.filter(Boolean).join('\n\n');}
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
function updateCustomFormula(){const tex=$('#customFormula').value;$('#customFormulaPreview').innerHTML=renderMath(tex,false);} $('#customFormula').oninput=updateCustomFormula;$('#insertCustomFormula').onclick=()=>insertFormula($('#customFormula').value,true);updateCustomFormula();
if(location.hash==='#formulas')setTimeout(openFormulaGuide,500);
