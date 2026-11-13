// Presentation only. Original controls, permissions and listeners remain in place.
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const sections=[
 ['ocr','Confronto fogli OCR','▤','Prova assistita · Donatello Annunziata','#driveOcrPilot'],
 ['presence','Presenze e budget','▦','Foglio mensile e ore per CDC','#presenceConsole',true],
 ['documents','Documenti e richieste','▤','Verifiche, ferie e ROL','#pendingDocs, #reviewedDocs',true],
 ['declarations','Ore e assenze','◷','Supplementare e giustificativi','.wc-admin',true],
 ['workers','Lavoratori','♙','Account, sedi e abilitazioni','#pendingUsers',true],
 ['shifts','Fasce orarie','◴','Turni e promemoria giornalieri','.dp-shifts',true],
 ['notifications','Controllo notifiche','🔔','Invii, aperture e problemi','.notification-report',true],
 ['messages','Messaggi ai lavoratori','✉','Comunicazioni individuali o per CDC','#messageSite'],
 ['missing','Sollecita mancanti','!','Richiedi i fogli settimanali','#missingList'],
 ['deliveries','Consegne mensili','✓','Chi ha caricato il definitivo','#deliveryList'],
 ['balances','Saldi ferie e ROL','▥','Importazioni e proiezioni','.leave-panel'],
 ['sitebudget','Ore per sede N153','▦','Controllo del budget per sede','.hour-budget'],
 ['drive','Archivio Google Drive','☁','Originali e scansioni salvati','[data-admin-drive]'],
 ['audit','Storico operazioni','↺','Attività e verifiche effettuate','#auditList']
];
let root,hub,home,workspace,title,jump,priorities,filterCard,scope,scopeLabel,observer,active='home',docFilter='all';
const states=new Map();
function directPanel(n){while(n?.parentElement&&n.parentElement!==root)n=n.parentElement;return n?.parentElement===root?n:null;}
function panels(key){const def=sections.find(s=>s[0]===key);return def?[...new Set([...root.querySelectorAll(def[4])].map(directPanel).filter(Boolean))]:[];}
function applyView(){
 if(!root)return;
 root.dataset.adminView=active;home.hidden=active!=='home';workspace.hidden=active==='home';
 scope.hidden=!['home','documents','declarations','workers','shifts','missing','deliveries'].includes(active);
 const anchor=active==='home'?priorities:workspace.querySelector('.admin-unavailable'),parent=active==='home'?home:workspace;if(scope.parentElement!==parent)parent.insertBefore(scope,anchor);
 const month=$('adminMonth').value;const date=/^\d{4}-\d{2}$/.test(month)?new Date(month+'-01T12:00:00').toLocaleDateString('it-IT',{month:'long',year:'numeric'}):'Seleziona mese';scopeLabel.textContent=date+' · '+($('adminSite').value||'Tutti i CDC');
 for(const card of [...root.children])card.classList.remove('admin-workspace-visible');
 for(const card of panels(active)){card.classList.add('admin-workspace-visible');if(card.tagName==='DETAILS'&&!card.hidden)card.open=true;const compact=card.querySelector('details.compact-list');if(compact)compact.open=true;if(card.matches('.dp-shifts'))card.querySelector('details').open=true;}
 const def=sections.find(s=>s[0]===active);title.textContent=def?.[1]||'Pannello responsabile';jump.value=active==='home'?'':active;
 for(const button of hub.querySelectorAll('[data-open-section]'))button.setAttribute('aria-current',String(button.dataset.openSection===active));
 const empty=workspace.querySelector('.admin-unavailable');empty.hidden=active==='home'||panels(active).some(p=>!p.hidden);empty.textContent='Sezione in caricamento. Se non compare, premi Aggiorna elenco.';
}
export function openAdminSection(key,{focus=true}={}){
 if(!root||!['home',...sections.map(s=>s[0])].includes(key))return;
 active=key;applyView();if(focus){hub.scrollIntoView({behavior:'auto',block:'start'});(key==='home'?home.querySelector('h2'):title).focus({preventScroll:true});}
}
export function revealAdminTask(kind,targetId){
 if(!root)return null;
 const key=kind==='registration'?'workers':'documents',attribute=key==='workers'?'workerId':'documentId';
 let state=states.get(key);if(state){state.query='';state.page=0;}const input=root.querySelector(`[data-admin-search="${key}"]`);if(input)input.value='';
 if(key==='documents')docFilter=kind==='authorization'?'authorize':'review';
 refreshAdminMenu();
 const candidates=key==='workers'?[...$('pendingUsers').querySelectorAll('.doc-row')].filter(r=>!$('adminSite').value||r.dataset.workerSite===$('adminSite').value):[...root.querySelectorAll('[data-document-id]')].filter(r=>r.dataset.adminAction===docFilter);
 const index=candidates.findIndex(r=>r.dataset[attribute]===targetId);if(index<0)return null;
 state=states.get(key);state.page=Math.floor(index/10);refreshAdminMenu();openAdminSection(key,{focus:false});return candidates[index];
}
export function resetAdminMenu(){active='home';docFilter='all';states.clear();if(root){for(const tools of root.querySelectorAll('[data-admin-tools]'))tools.remove();for(const input of root.querySelectorAll('[data-admin-search]'))input.value='';applyView();}}
function button(text,handler,cls){const n=el('button',text,cls);n.type='button';n.onclick=handler;return n;}
function countActions(action){return root.querySelectorAll(`[data-admin-action="${action}"]`).length;}
function updatePriorities(){
 priorities.replaceChildren();for(const [action,label] of [['review','Da verificare'],['authorize','Da autorizzare']]){const count=countActions(action),b=button('',()=>{docFilter=action;if(states.has('documents'))states.get('documents').page=0;refreshAdminMenu();openAdminSection('documents');},'admin-priority'+(count?' has-work':''));b.append(el('strong',count),el('span',label),el('span','›'));b.setAttribute('aria-label',`${label}: ${count}`);priorities.append(b);}
}
function workerFolds(){for(const row of $('pendingUsers').querySelectorAll(':scope > .doc-row')){
 const fold=el('details',null,'admin-worker-fold'),summary=el('summary'),info=row.firstElementChild;
 summary.append(el('strong',info?.querySelector('strong')?.textContent||'Lavoratore'),el('small',[...info?.querySelectorAll('small')||[]].filter(s=>!s.textContent.startsWith('Email')).map(s=>s.textContent).join(' · ')),el('span','⌄'));
 fold.dataset.adminSearchText=info?.textContent||'';fold.dataset.adminWorker='';fold.dataset.workerSite=row.dataset.workerSite||'';row.before(fold);fold.append(summary,row);
}}
function listTools(key,area,placeholder,items){
 let state=states.get(key);if(!state){state={query:'',page:0};states.set(key,state);}
 let tools=area.parentElement.querySelector(`:scope > [data-admin-tools="${key}"]`);
 if(!tools){tools=el('div',null,'admin-list-tools');tools.dataset.adminTools=key;const input=el('input');input.type='search';input.placeholder=placeholder;input.setAttribute('aria-label',placeholder);input.dataset.adminSearch=key;input.value=state.query;const counter=el('p',null,'admin-list-count'),pages=el('div',null,'admin-list-pages');counter.setAttribute('role','status');tools.append(input,counter,pages);area.before(tools);
 if(key==='documents'){const select=el('select');select.setAttribute('aria-label','Stato documenti');for(const [v,t]of [['all','Tutti i documenti'],['review','Da verificare'],['authorize','Da autorizzare'],['processed','Già gestiti']])select.append(new Option(t,v));select.onchange=()=>{docFilter=select.value;state.page=0;render();};tools.insertBefore(select,counter);}
 input.oninput=()=>{state.query=input.value;state.page=0;render();};
 }
 function render(){
 const rows=items(),query=state.query.trim().toLocaleLowerCase('it');
 const selected=rows.filter(row=>(key!=='workers'||!$('adminSite').value||row.dataset.workerSite===$('adminSite').value)&&(!query||(row.dataset.adminSearchText||row.textContent).toLocaleLowerCase('it').includes(query))&&(key!=='documents'||docFilter==='all'||(docFilter==='processed'?!row.dataset.adminAction:row.dataset.adminAction===docFilter)));
 const size=10,max=Math.max(0,Math.ceil(selected.length/size)-1);state.page=Math.min(state.page,max);
 const visible=new Set(selected.slice(state.page*size,state.page*size+size));for(const row of rows)row.hidden=!visible.has(row);
 const counter=tools.querySelector('p');counter.textContent=selected.length?`${state.page*size+1}–${Math.min((state.page+1)*size,selected.length)} di ${selected.length}`:'Nessun risultato per i filtri selezionati.';
 const pages=tools.querySelector('.admin-list-pages');pages.replaceChildren();if(selected.length>size){const prev=button('‹ Precedenti',()=>{state.page--;render();}),next=button('Successivi ›',()=>{state.page++;render();});prev.disabled=state.page===0;next.disabled=state.page===max;pages.append(prev,el('span',`${state.page+1} / ${max+1}`),next);}
 if(key==='documents')tools.querySelector('select').value=docFilter;
 }
 render();
}
function setup(){
 root=$('adminOperations');if(!root)return;
 root.classList.add('admin-compact');
 const style=el('style');style.textContent=`
 main:has(#adminArea:not(.hidden)):has(#docsApp:not(.hidden))>.hero{display:none}
 main:has(#adminArea:not(.hidden)) .card:has(#loggedArea)>h2,main:has(#adminArea:not(.hidden)) .card:has(#loggedArea)>.doc-lead{display:none}main:has(#adminArea:not(.hidden)) .card:has(#loggedArea){padding:8px 16px;margin:0 0 8px}main:has(#adminArea:not(.hidden)) .card:has(#loggedArea) .doc-row{padding:3px 0}main:has(#adminArea:not(.hidden)) .card:has(#loggedArea) #appMsg:empty{display:none}
 main:has(#adminArea:not(.hidden)):has(#docsApp:not(.hidden))>.brand{margin-bottom:12px}
 #adminOperations.admin-compact{display:flex;flex-direction:column;gap:14px;min-width:0}#adminOperations.hidden{display:none!important}
 .admin-compact>:not(.admin-hub):not(.admin-filter-panel):not(.admin-workspace-visible){display:none!important}
 .admin-scope[hidden]{display:none!important}.admin-scope{border:1px solid #d6e7dd;border-radius:14px;background:#ffffffb8;margin:12px 0}.admin-scope>summary{padding:12px 14px;color:#2b6757;font-size:13px;font-weight:650;cursor:pointer}.admin-scope .admin-filter-panel{border:0!important;border-top:1px solid #e3eee8!important;border-radius:0 0 14px 14px!important}
 .admin-compact:not([data-admin-view=home])>.admin-hub{position:sticky;top:0;z-index:8;background:#edf6f3;border-radius:0 0 16px 16px;padding-bottom:6px} .admin-hub{order:-30;scroll-margin-top:14px;min-width:0}.admin-hub [hidden]{display:none!important}
 .admin-hub h2{font-size:25px;margin:2px 0 5px;color:#163f38;letter-spacing:-.5px}.admin-hub h2:focus{outline:none}.admin-hub p{margin:0;color:#6b807b;font-size:14px;line-height:1.4}
 .admin-priorities{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:15px 0}.admin-priority{display:flex;align-items:center;gap:10px;padding:14px;border:1px solid #d9e8e1;border-radius:17px;background:white;color:#47635b;text-align:left;font:inherit;cursor:pointer}.admin-priority strong{font-size:25px;color:#08796c}.admin-priority span{font-size:13px;font-weight:650}.admin-priority span:last-child{margin-left:auto;font-size:22px}.admin-priority.has-work{background:#fff7e7;border-color:#efd596;color:#77571a}.admin-priority.has-work strong{color:#946318}
 .admin-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.admin-tile{position:relative;display:flex;align-items:flex-start;gap:13px;min-width:0;min-height:112px;padding:18px;text-align:left;border:1px solid #d8e8e1;border-radius:20px;background:#fff;color:#183f38;box-shadow:0 5px 18px #164c3b04;font:inherit;cursor:pointer}.admin-tile:hover{border-color:#6bb7a1;background:#f8fffb}.admin-tile>span:first-child{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:12px;background:#e5f5ee;color:#08796b;font-size:24px}.admin-tile strong{display:block;font-size:16px;line-height:1.25}.admin-tile small{display:block;color:#71847d;font-size:12px;line-height:1.4;margin-top:6px}.admin-tile:first-child{background:#087a6d;color:#fff;border-color:#087a6d}.admin-tile:first-child>span:first-child{background:#ffffff24;color:white}.admin-tile:first-child small{color:#d2eee7}
 .admin-more{background:#fff;border:1px solid #d8e8e1;border-radius:16px;margin:13px 0 0;padding:0 15px}.admin-more>summary{font-weight:700;cursor:pointer;color:#246257;padding:15px 0;font-size:14px}.admin-tools-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-bottom:14px}.admin-tools-grid button{border:1px solid #dcebe5;background:#f6fbf8;border-radius:12px;padding:14px 10px;color:#245a4e;text-align:left;font:inherit;font-size:13px;cursor:pointer;min-height:48px}
 .admin-workspace-bar{display:flex;align-items:center;gap:12px;padding:12px 0;flex-wrap:wrap}.admin-back{border:1px solid #bad8cb;background:#fff;color:#096c5c;border-radius:12px;padding:11px 14px;font:inherit;font-size:14px;font-weight:750;min-height:44px;cursor:pointer}.admin-workspace-bar select{flex:1;min-width:0;font:inherit;font-size:14px;color:#315e51;border:1px solid #c9e0d5;background:#f8fcfa;border-radius:12px;padding:11px;min-height:44px}.admin-workspace-title{margin-top:9px!important}.admin-unavailable{padding:16px;background:#fff4dc;border-radius:14px}
 .admin-compact .admin-filter-panel{order:-20;padding:14px 16px!important;margin:0!important;border:1px solid #dce9e3;border-radius:18px;box-shadow:none}.admin-filter-panel>h2{display:none}.admin-filter-fields{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.admin-filter-fields label{font-size:12px;margin:0 0 5px}.admin-filter-fields select,.admin-filter-fields input{font-size:14px;min-height:44px;padding:9px;min-width:0}.admin-filter-fields button{width:auto;font-size:13px;margin:0;padding:11px 15px;min-height:44px}.admin-filter-panel #adminStats{font-size:12px;margin-top:9px;line-height:1.4}
 .admin-workspace-visible{margin:0!important;min-width:0;max-width:100%;border-radius:20px!important}.admin-workspace-visible>summary{display:none!important}.admin-workspace-visible .compact-list>summary{display:none}.admin-workspace-visible .compact-list>.list-pages{display:none}.admin-workspace-visible .compact-list{display:block}.admin-workspace-visible .compact-list:not([open])>:not(summary){display:block}
 .admin-workspace-visible.dp-shifts>details>summary{display:none}.admin-workspace-visible.dp-shifts{padding:18px}.admin-workspace-visible .doc-row{align-items:flex-start;gap:14px}.admin-workspace-visible .doc-row>div:first-child{min-width:0;flex:1}.admin-workspace-visible .doc-row strong{font-size:15px;line-height:1.35;overflow-wrap:anywhere}.admin-workspace-visible .doc-row small{font-size:12px;line-height:1.45;overflow-wrap:anywhere}.admin-workspace-visible .doc-toolbar{flex:0 1 260px}.admin-workspace-visible .doc-toolbar button{min-height:40px;padding:10px 12px}
 .admin-list-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px;margin:10px 0 15px}.admin-list-tools input{font-size:16px;padding:11px;min-width:0;grid-column:1/-1}.admin-list-tools select{font:inherit;font-size:14px;background:#f6faf8;border:1px solid #cce0d7;border-radius:12px;padding:11px;grid-column:1/-1}.admin-list-count{color:#647e73;font-size:12px;margin:0;align-self:center;grid-column:1/-1}.admin-list-pages{display:flex;gap:10px;align-items:center;justify-content:space-between;grid-column:1/-1}.admin-list-pages:empty{display:none}.admin-list-pages button{font:inherit;font-size:13px;border:1px solid #c3ded1;border-radius:10px;background:#f4fbf7;padding:10px;color:#176a53;min-height:42px;cursor:pointer}.admin-list-pages button:disabled{opacity:.4;cursor:default}.admin-list-pages span{font-size:12px;color:#6b8278}
 .admin-worker-fold{border:1px solid #d9e8e0;border-radius:14px;margin:9px 0;overflow:hidden;background:#fbfefc}.admin-worker-fold[hidden]{display:none!important}.admin-worker-fold>summary{position:relative;padding:15px 38px 15px 15px;cursor:pointer;list-style:none}.admin-worker-fold>summary::-webkit-details-marker{display:none}.admin-worker-fold>summary strong{font-size:15px;display:block;overflow-wrap:anywhere}.admin-worker-fold>summary small{font-size:12px;color:#6b8278;display:block;margin-top:5px}.admin-worker-fold>summary>span{position:absolute;right:15px;top:17px;color:#528773}.admin-worker-fold>.doc-row{padding:16px;border-top:1px solid #dcebe3}.admin-worker-fold>.doc-row>div:last-child{flex:1;min-width:0}.admin-worker-fold[open]>summary{background:#edf8f1}
 .admin-compact [hidden]{display:none!important}.admin-workspace-visible:has(#pendingDocs)>h2{display:none}.admin-workspace-visible:has(#pendingDocs) #pendingDocs:empty{display:none}
 @media(max-width:760px){main:has(#adminArea:not(.hidden)):has(#docsApp:not(.hidden)){padding-top:16px}.admin-navigation{margin:8px 0 16px}.admin-navigation button{min-height:44px;padding:10px;font-size:13px}.admin-hub h2{font-size:23px}.admin-hub p{font-size:13px}.admin-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.admin-tile{display:block;min-height:122px;padding:14px}.admin-tile>span:first-child{width:34px;height:34px;margin-bottom:10px;font-size:22px}.admin-tile strong{font-size:15px}.admin-tile small{font-size:11px}.admin-tools-grid{grid-template-columns:1fr 1fr}.admin-priority{padding:12px 10px;gap:8px}.admin-priority span{font-size:12px}.admin-filter-fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.admin-filter-fields button{grid-column:1/-1;width:100%;min-height:36px;padding:8px}.admin-workspace-visible{padding:17px!important}.admin-workspace-visible .doc-row{display:block}.admin-workspace-visible .doc-toolbar{margin-top:12px}.admin-worker-fold>.doc-row{padding:14px}.admin-compact .admin-filter-panel{padding:12px!important}}

 .admin-macros{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.admin-macro{min-width:0;border:1px solid #d6e7df;border-radius:20px;background:#fff;padding:17px;box-shadow:0 5px 18px #164c3b04}.admin-macro-heading{margin:0 0 12px}.admin-macro-heading h3{font-size:18px;color:#174d40;margin:0 0 4px;line-height:1.3}.admin-macro-heading p{font-size:12px;color:#788c82;margin:0}.admin-macro-links{display:grid;gap:8px}.admin-area-link{display:flex;align-items:center;gap:12px;width:100%;min-width:0;min-height:68px;border:1px solid #e1ece6;border-radius:13px;background:#f9fcfa;text-align:left;padding:12px;color:#1c4439;font:inherit;cursor:pointer}.admin-area-link:hover{background:#edf8f1;border-color:#9ecab5}.admin-area-link>span:nth-child(2){flex:1;min-width:0}.admin-area-link strong{display:block;font-size:14px;line-height:1.3;overflow-wrap:anywhere}.admin-area-link small{display:block;font-size:11px;color:#73877d;line-height:1.35;margin-top:4px}.admin-area-icon{flex:0 0 32px;height:32px;display:grid;place-items:center;background:#e5f4ed;color:#087563;border-radius:10px;font-size:21px}.admin-area-arrow{color:#88a195;font-size:21px;flex-shrink:0}.admin-macro:first-child{border-top:3px solid #087b69}.admin-macro:nth-child(2){border-top:3px solid #7ea888}.admin-macro:nth-child(3){border-top:3px solid #7a9fb1}.admin-macro:nth-child(4){border-top:3px solid #cbb071}.admin-macro:nth-child(5){border-top:3px solid #a29bb7}
 @media(max-width:760px){.admin-macros{grid-template-columns:1fr;gap:12px}.admin-macro{padding:14px}.admin-macro-heading{margin-bottom:10px}.admin-macro-heading h3{font-size:17px}.admin-macro-heading p{font-size:11px}.admin-macro-links{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.admin-area-link{align-items:flex-start;gap:8px;min-height:85px;padding:11px 9px}.admin-area-link strong{font-size:13px}.admin-area-link small{font-size:10px}.admin-area-icon{flex-basis:25px;height:28px;font-size:18px;border-radius:8px}.admin-area-arrow{display:none}.admin-macro-links>.admin-area-link:last-child:nth-child(odd){grid-column:1/-1;min-height:62px;align-items:center}}
 `;document.head.append(style);
 hub=el('section',null,'admin-hub');home=el('div');const heading=el('h2','Il tuo pannello');heading.tabIndex=-1;home.append(heading,el('p','Scegli cosa vuoi consultare.'));priorities=el('div',null,'admin-priorities');home.append(priorities);
 const areas=[
 ['Presenze e budget','Ore lavorate, supplementare e costi',['presence','sitebudget','declarations']],
 ['Documenti e ferie','Richieste, saldi e consegne',['documents','balances','deliveries']],
 ['Lavoratori e turni','Anagrafiche e organizzazione del servizio',['workers','shifts']],
 ['Comunicazioni','Messaggi, promemoria e notifiche',['messages','notifications','missing']],
 ['Archivi e storico','Documenti salvati e attività svolte',['drive','audit']]
 ];
 const macros=el('div',null,'admin-macros');
 for(const [area,description,keys]of areas){const group=el('section',null,'admin-macro');group.setAttribute('aria-label',area);const heading=el('div',null,'admin-macro-heading');heading.append(el('h3',area),el('p',description));const grid=el('div',null,'admin-macro-links');
 for(const key of keys){const [,label,icon,hint]=sections.find(s=>s[0]===key),b=button('',()=>openAdminSection(key),'admin-area-link');b.dataset.openSection=key;const copy=el('span');copy.append(el('strong',label),el('small',hint));b.append(el('span',icon,'admin-area-icon'),copy,el('span','›','admin-area-arrow'));grid.append(b);}
 if(area==='Archivi e storico'){const archive=button('',()=>$('showArchive').click(),'admin-area-link'),copy=el('span');copy.append(el('strong','Archivio lavoratori'),el('small','Consulta ed esporta i documenti'));archive.append(el('span','▤','admin-area-icon'),copy,el('span','›','admin-area-arrow'));grid.prepend(archive);}
 group.append(heading,grid);macros.append(group);}
 home.append(macros);workspace=el('div');workspace.hidden=true;const bar=el('div',null,'admin-workspace-bar');jump=el('select');jump.setAttribute('aria-label','Vai a una sezione');jump.append(new Option('Scegli una sezione',''));for(const [key,label]of sections)jump.append(new Option(label,key));jump.onchange=()=>openAdminSection(jump.value);bar.append(button('‹ Menu',()=>openAdminSection('home'),'admin-back'),jump);title=el('h2',null,'admin-workspace-title');title.tabIndex=-1;workspace.append(bar,title,el('p',null,'admin-unavailable'));hub.append(home,workspace);root.prepend(hub);
 filterCard=$('adminSite').closest('section');filterCard.classList.add('admin-filter-panel');const fields=el('div',null,'admin-filter-fields');for(const id of ['adminSite','adminMonth']){const input=$(id),label=filterCard.querySelector(`label[for="${id}"]`),group=el('div');group.append(label,input);fields.append(group);}fields.append($('refreshAdmin'));filterCard.insertBefore(fields,$('adminStats'));scope=el('details',null,'admin-scope');scopeLabel=el('summary');scopeLabel.setAttribute('aria-label','Filtra per mese e centro di costo');scope.append(scopeLabel,filterCard);home.insertBefore(scope,priorities);
 $('showOperations').textContent='Pannello';$('showOperations').addEventListener('click',()=>openAdminSection('home',{focus:false}));
 observer=new MutationObserver(()=>{refreshAdminMenu();});observer.observe(root,{childList:true});
}
export function refreshAdminMenu(){
 if(!root)setup();if(!root)return;
 // Stable markers for panels created by existing renderers.
 for(const child of root.children)if(child.querySelector(':scope > h3')?.textContent==='Archivio Google Drive')child.dataset.adminDrive='';
 workerFolds();
 const pending=$('pendingDocs'),reviewed=$('reviewedDocs');
 // A shared search controls both original document lists; no cloned action buttons.
 listTools('documents',pending,'Cerca lavoratore o documento',()=>[...pending.querySelectorAll('.doc-row'),...reviewed.querySelectorAll('.doc-row')]);
 listTools('workers',$('pendingUsers'),'Cerca lavoratore, sede o email',()=>[...$('pendingUsers').children].filter(n=>n.classList.contains('admin-worker-fold')));
 listTools('deliveries',$('deliveryList'),'Cerca nelle consegne',()=>[...$('deliveryList').querySelectorAll('.doc-row')]);
 listTools('audit',$('auditList'),'Cerca nello storico',()=>[...$('auditList').querySelectorAll('.doc-row')]);
 const declarations=root.querySelector('.wc-admin');if(declarations){let list=declarations.querySelector('.admin-declaration-list');if(!list){list=el('div',null,'admin-declaration-list');for(const d of [...declarations.children].filter(n=>n.tagName==='DETAILS'))list.append(d);declarations.append(list);}listTools('declarations',list,'Cerca lavoratore o settimana',()=>[...list.children]);}
 updatePriorities();applyView();
}

