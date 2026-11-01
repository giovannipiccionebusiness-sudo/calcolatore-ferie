import {revealWorkerTarget} from './worker-menu.js?v=71';
export function guideSteps(kind='presenze',form=false){
 if(kind==='daily')return form?[
  {title:'Scegli cosa comunicare',text:'Per lo stesso giorno seleziona una sola voce: Supplementare oppure Assenza.',target:'[data-guide="daily-choice"]'},
  {title:'Inserisci i dettagli',text:'Per le ore supplementari indica la durata. Per un’assenza scegli il giustificativo e indica se copre tutta la giornata o solo alcune ore.',target:'[data-guide="daily-card"]'},
  {title:'Conferma i dati',text:'Controlla la giornata e spunta la conferma. Le tue dichiarazioni verranno verificate dal responsabile.',target:'[data-guide="daily-confirm"]'},
  {title:'Salva la giornata',text:'Premi qui per salvare. La ritroverai nel riepilogo settimanale e nelle presenze della sede.',target:'[data-guide="daily-save"]'}
 ]:[
  {title:'Scegli il giorno',text:'Seleziona la giornata da aggiornare. La notifica del responsabile apre direttamente il giorno corretto.',target:'dpDay'},
  {title:'Apri l’inserimento',text:'Premi “Inserisci variazioni” per indicare ore supplementari oppure un’assenza.',target:'dpCompile'},
  {title:'Riepilogo settimanale',text:'Da qui puoi controllare e confermare le giornate già trascorse della settimana.',target:'[data-guide="daily-summary"]'}
 ];
 if(kind==='other')return [
  {title:'Scegli il documento',text:'Seleziona il modulo che vuoi inviare. Per il congedo parentale puoi aggiungere più pagine in un unico PDF.',target:'docType'},
  {title:'Indica il periodo',text:'Per ferie e ROL scrivi le date richieste. Non inserire diagnosi o altri dettagli sanitari nelle note.',target:'docNote'},
  {title:'Scansiona o carica',text:'Premi il pulsante, fotografa il modulo firmato oppure scegli un PDF o una foto già salvati.',target:'uploadOther'},
  {title:'Controlla l’invio',text:'In “I miei caricamenti” puoi vedere se il documento è in verifica, verificato o respinto. La verifica non equivale all’autorizzazione.',target:'docList'}
 ];
 if(kind==='modules')return [
  {title:'Scegli il modulo',text:'Apri “Moduli da scaricare” e individua il foglio che ti serve.',target:'workerModulesPanel'},
  {title:'Scarica il PDF',text:'Premi “Scarica PDF” e compila il modulo sul telefono o stampalo.',target:'module-presence-download'},
  {title:'Invialo dall’app',text:'Per trasmettere il foglio o una richiesta, torna al percorso di caricamento corrispondente.',target:'workerPresencePanel'}
 ];
 return [
  {title:'Controlla il mese',text:'Il mese di riferimento è selezionato nella schermata principale, appena sopra il pulsante “Carica foglio presenze”. Se è errato, chiudi questa finestra e cambialo.',target:'presenceDialogTitle'},
  {title:'Scegli il venerdì',text:'Per il foglio settimanale o una sostituzione, seleziona il venerdì della settimana indicata.',target:'workerWeek'},
  {title:'Aggiorna il foglio',text:'Usa questo pulsante ogni settimana per inviare il foglio aggiornato.',target:'updateSheet'},
  {title:'Correggi un invio',text:'Se devi correggere un foglio già inviato per la stessa settimana, usa “Sostituisci”.',target:'replaceSheet'},
  {title:'Invia il definitivo',text:'Usa il definitivo soltanto quando il foglio comprende tutto il mese ed è firmato.',target:'finalSheet'},
  {title:'Fotografa tutto il foglio',text:'Inquadra tutti i bordi con buona luce. Puoi anche scegliere una foto o un PDF già salvati; attendi il messaggio di invio completato.',target:'presenceDialogTitle'},
  {title:'Controlla lo stato',text:'Cerca l’invio in “I miei caricamenti”. “In verifica” significa che il responsabile deve ancora controllarlo.',target:'docList'}
 ];
}
const worker=document.getElementById('workerArea'),startButton=document.getElementById('startWorkerGuide');
if(worker&&startButton){
 let index=0,kind='presenze',formMode=false,previousFocus=null,currentUser='',isActiveWorker=false,welcome=null;
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const panel=make('section',null,'worker-guide-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Guida interattiva');panel.setAttribute('aria-live','polite');
 const label=make('label','Percorso'),select=make('select',null,'doc-select');select.id='workerGuideKind';label.htmlFor=select.id;
 for(const [value,text]of [['presenze','Foglio presenze'],['daily','Ore in più e assenze'],['other','Altri documenti'],['modules','Moduli da scaricare']]){const o=make('option',text);o.value=value;select.append(o);}
 const count=make('p',null,'worker-guide-count'),title=make('h3',null,'worker-guide-title'),copy=make('p',null,'worker-guide-copy'),controls=make('div',null,'worker-guide-controls');
 const back=make('button','Indietro'),next=make('button','Avanti'),disable=make('button','Non mostrare più'),close=make('button','Chiudi guida');
 for(const b of [back,next,disable,close])b.type='button';title.tabIndex=-1;controls.append(back,next,disable,close);panel.append(label,select,count,title,copy,controls);document.body.append(panel);
 const storage=(key,value)=>{try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);return value;}catch{return null;}};
 const key=(part,k='')=>'lavorofacile-guide:'+currentUser+':'+part+(k?':'+k:'');
 const normKind=value=>value==='daily-form'?'daily':value;
 const findTarget=ref=>ref?.startsWith('[')?document.querySelector(ref):document.getElementById(ref);
 function unmark(){document.querySelectorAll('.worker-guide-target').forEach(e=>e.classList.remove('worker-guide-target'));}
 function stop(){
  const host=panel.parentElement;if(host&&host!==document.body)document.body.append(panel);
  panel.hidden=true;unmark();document.body.classList.remove('worker-guide-active');
  if(previousFocus?.isConnected&&!worker.classList.contains('hidden'))previousFocus.focus({preventScroll:true});
 }
 function render(){
  const steps=guideSteps(kind,formMode),step=steps[index];if(!step)return;
  count.textContent='Passaggio '+(index+1)+' di '+steps.length;title.textContent=step.title;copy.textContent=step.text;back.disabled=index===0;next.disabled=index===steps.length-1;
  unmark();const target=findTarget(step.target);
  if(target){revealWorkerTarget(target);target.classList.add('worker-guide-target');target.scrollIntoView({behavior:'smooth',block:'center'});}
  const host=target?.closest('dialog[open]')||document.body;if(panel.parentElement!==host)host.append(panel);
  panel.hidden=false;title.focus({preventScroll:true});
 }
 function start(nextKind='presenze',options={}){
  const raw=nextKind||select.value;kind=normKind(raw);formMode=raw==='daily-form'||!!options.form;select.value=kind;
  previousFocus=options.focus||document.activeElement;index=0;storage(key('seen',kind),'1');panel.hidden=false;document.body.classList.add('worker-guide-active');render();
 }
 function autoStart(nextKind,options={}){
  if(!currentUser||!isActiveWorker||storage(key('automatic'))!=='1')return false;
  const normalized=normKind(nextKind);if(storage(key('seen',normalized))==='1')return false;
  start(nextKind,{...options,automatic:true});return true;
 }
 window.workerGuides={start,guideSteps};
 startButton.onclick=()=>start(select.value,{focus:startButton});
 select.onchange=()=>{kind=select.value;formMode=false;index=0;render();};
 back.onclick=()=>{if(index>0){index--;render();}};
 next.onclick=()=>{if(index<guideSteps(kind,formMode).length-1){index++;render();}};
 close.onclick=stop;
 disable.onclick=()=>{storage(key('automatic'),'0');stop();};
 document.addEventListener('click',event=>{const b=event.target.closest?.('[data-guide-launch]');if(b){event.preventDefault();start(b.dataset.guideLaunch,{focus:b,form:b.dataset.guideLaunch==='daily-form'});}});
 document.getElementById('openPresenceDialog')?.addEventListener('click',()=>autoStart('presenze',{form:true}));
 document.getElementById('uploadOther')?.addEventListener('click',event=>{if(autoStart('other',{form:true})){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 worker.addEventListener('toggle',event=>{if(event.target?.id==='workerOtherPanel'&&event.target.open)autoStart('other',{form:true});},true);
 window.addEventListener('lavoro-facile:guide-request',event=>{const detail=event.detail||{};if(detail.automatic)autoStart(detail.kind||'daily-form',{form:true});});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();stop();}});
 document.addEventListener('close',event=>{if(event.target?.matches?.('dialog')&&panel.parentElement===event.target&&!panel.hidden)stop();},true);
 function welcomePrompt(){
  if(!currentUser||!isActiveWorker||storage(key('welcome'))==='1'||welcome)return;
  if(document.querySelector('dialog[open]')){setTimeout(welcomePrompt,450);return;}
  welcome=make('dialog',null,'worker-guide-welcome');welcome.setAttribute('aria-labelledby','workerGuideWelcomeTitle');
  const h=make('h2','Vuoi una guida nei tuoi primi inserimenti?');h.id='workerGuideWelcomeTitle';
  const p=make('p','Al primo utilizzo di ogni percorso (presenze giornaliere, foglio presenze, richieste e moduli) puoi seguire un tutorial passo passo. Potrai riaprire la guida dal simbolo ⓘ presente nelle varie sezioni.');
  const actions=make('div',null,'worker-guide-welcome-actions'),yes=make('button','Sì, guidami'),no=make('button','No, grazie');yes.type=no.type='button';actions.append(no,yes);welcome.append(h,p,actions);document.body.append(welcome);
  const finish=enabled=>{storage(key('automatic'),enabled?'1':'0');storage(key('welcome'),'1');if(welcome?.open)welcome.close();welcome?.remove();welcome=null;};
  yes.onclick=()=>finish(true);no.onclick=()=>finish(false);welcome.addEventListener('cancel',event=>{event.preventDefault();finish(false);});welcome.showModal();
 }
 function syncUser(){
  const state=window.__lfGuideState||{};const next=state.userId||'',role=state.role||'';
  if(next!==currentUser){stop();if(welcome?.open)welcome.close();welcome?.remove();welcome=null;currentUser=next;isActiveWorker=role==='worker'&&!!state.active;}
  else isActiveWorker=role==='worker'&&!!state.active;
  if(isActiveWorker)setTimeout(welcomePrompt,250);else{if(welcome?.open)welcome.close();welcome?.remove();welcome=null;}
 }
 window.addEventListener('lf-guide-state',syncUser);syncUser();
 new MutationObserver(()=>{if(worker.classList.contains('hidden'))stop();}).observe(worker,{attributes:true,attributeFilter:['class']});
}
