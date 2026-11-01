import {revealWorkerTarget} from './worker-menu.js?v=71';
export function guideSteps(kind='presenze',form=false){
 if(kind==='daily')return form?[
  {title:'Scegli cosa comunicare',text:'Scegli una sola opzione: “Supplementare” per le ore in più oppure “Assenza” se non hai lavorato.',target:'[data-guide="daily-choice"]'},
  {title:'Inserisci i dettagli',text:'Se hai scelto “Supplementare”, scrivi la durata (per esempio 1:30). Se hai scelto “Assenza”, scegli il motivo e la durata.',target:'[data-guide="daily-card"]'},
  {title:'Conferma i dati',text:'Controlla giorno e dati inseriti. Per i giorni già trascorsi, spunta la casella di conferma.',target:'[data-guide="daily-confirm"]'},
  {title:'Salva la giornata',text:'Premi “Salva giornata”. Il responsabile controllerà le informazioni inserite.',target:'[data-guide="daily-save"]'}
 ]:[
  {title:'Scegli il giorno',text:'Scegli la data da compilare. Se sei entrato da una notifica, la data è già impostata.',target:'dpDay'},
  {title:'Apri l’inserimento',text:'Premi “Inserisci variazioni”. Seleziona poi “Supplementare” oppure “Assenza”: puoi indicarne una sola per giornata.',target:'dpCompile'},
  {title:'Riepilogo settimanale',text:'Apri il riepilogo per controllare le giornate già inserite e confermare quelle passate.',target:'[data-guide="daily-summary"]'}
 ];
 if(kind==='colleague')return [
  {title:'Carica per un collega',text:'Tocca il pulsante indicato. Scegli il collega, il mese e il documento; per le presenze seleziona settimanale o definitivo, poi carica la foto o il PDF.',target:'uploadColleagueButton'}
 ];
 if(kind==='uploads')return [
  {title:'Controlla i tuoi invii',text:'Apri “I miei caricamenti”. Qui trovi i documenti inviati e puoi controllare se sono in verifica, verificati o respinti.',target:'docList'},
  {title:'Leggi lo stato',text:'Lo stato indica a che punto è il controllo del responsabile. Se un invio è respinto, leggi il motivo prima di caricarlo di nuovo.',target:'docList'}
 ];
 if(kind==='messages')return [
  {title:'Apri i messaggi',text:'Qui ricevi gli esiti e i solleciti del responsabile.',target:'workerMessagesPanel'},
  {title:'Leggi il messaggio',text:'Apri il messaggio per leggere l’esito o capire quale documento manca.',target:'myNotifications'}
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
  {title:'Controlla il mese',text:'Scegli il mese di riferimento nella schermata principale, appena sopra il pulsante “Carica foglio presenze”. Se è errato, chiudi questa finestra e cambialo.',target:'month'},
  {title:'Scegli il venerdì',text:'Per il foglio settimanale o una sostituzione, seleziona il venerdì della settimana indicata.',target:'workerWeek'},
  {title:'Aggiorna il foglio',text:'Usa questo pulsante ogni settimana per inviare il foglio aggiornato.',target:'updateSheet'},
  {title:'Correggi un invio',text:'Se devi correggere un foglio già inviato per la stessa settimana, usa “Sostituisci”.',target:'replaceSheet'},
  {title:'Invia il definitivo',text:'Usa il definitivo soltanto quando il foglio comprende tutto il mese ed è firmato.',target:'finalSheet'},
  {title:'Fotografa tutto il foglio',text:'Inquadra tutti i bordi con buona luce. Puoi anche scegliere una foto o un PDF già salvati; attendi il messaggio di invio completato.',target:'presenceDialogTitle'},
  {title:'Controlla lo stato',text:'Cerca l’invio in “I miei caricamenti”. “In verifica” significa che il responsabile deve ancora controllarlo.',target:'docList'}
 ];
}
const worker=document.getElementById('workerArea');
if(worker){
 let index=0,kind='presenze',formMode=false,previousFocus=null,currentUser='',isActiveWorker=false,welcome=null,spotlightNodes=[],spotlightTarget=null,spotlightFrame=false,spotlightTimer=0;
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const panel=make('section',null,'worker-guide-panel');panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Guida interattiva');panel.setAttribute('aria-live','polite');
 const count=make('p',null,'worker-guide-count'),title=make('h3',null,'worker-guide-title'),copy=make('p',null,'worker-guide-copy'),controls=make('div',null,'worker-guide-controls');
 const back=make('button','Indietro'),next=make('button','Avanti'),disable=make('button','Non mostrare più'),close=make('button','Chiudi guida');
 for(const b of [back,next,disable,close])b.type='button';title.tabIndex=-1;controls.append(back,next,disable,close);panel.append(count,title,copy,controls);document.body.append(panel);
 const storage=(key,value)=>{try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);return value;}catch{return null;}};
 const key=(part,k='')=>'lavorofacile-guide:'+currentUser+':'+part+(k?':'+k:'');
 const normKind=value=>value==='daily-form'?'daily':value;
 const findTarget=ref=>ref?.startsWith('[')?document.querySelector(ref):document.getElementById(ref);
 function clearSpotlight(){if(spotlightTimer){clearTimeout(spotlightTimer);spotlightTimer=0;}spotlightNodes.forEach(node=>node.remove());spotlightNodes=[];spotlightTarget=null;}
 function unmark(){clearSpotlight();document.querySelectorAll('.worker-guide-target').forEach(e=>e.classList.remove('worker-guide-target'));}
 function showSpotlight(target){
  if(!target?.isConnected||panel.hidden)return;clearSpotlight();spotlightTarget=target;
  const dialog=target.closest('dialog[open]'),root=dialog||document.body;
  const bounds=dialog?dialog.getBoundingClientRect():{left:0,top:0,right:innerWidth,bottom:innerHeight};
  const width=Math.max(0,bounds.right-bounds.left),height=Math.max(0,bounds.bottom-bounds.top),r=target.getBoundingClientRect(),gap=10;
  const left=Math.max(bounds.left,Math.min(bounds.right,r.left-gap)),right=Math.max(left,Math.min(bounds.right,r.right+gap));
  const top=Math.max(bounds.top,Math.min(bounds.bottom,r.top-gap)),bottom=Math.max(top,Math.min(bounds.bottom,r.bottom+gap));
  const localX=v=>dialog?v-bounds.left:v,localY=v=>dialog?v-bounds.top:v;
  const boxes=[[0,0,width,localY(top)],[localY(top),0,localX(left),Math.max(0,localY(bottom)-localY(top))],[localY(top),localX(right),Math.max(0,width-localX(right)),Math.max(0,localY(bottom)-localY(top))],[localY(bottom),0,width,Math.max(0,height-localY(bottom))]];
  for(const [t,l,w,h] of boxes){if(w<=0||h<=0)continue;const shade=document.createElement('div');shade.className='worker-guide-shade';shade.setAttribute('aria-hidden','true');shade.style.cssText='position:'+(dialog?'absolute':'fixed')+';z-index:2147483000;top:'+t+'px;left:'+l+'px;width:'+w+'px;height:'+h+'px';root.append(shade);spotlightNodes.push(shade);}
 }
 function scheduleSpotlight(){if(!spotlightTarget||panel.hidden||spotlightFrame)return;spotlightFrame=true;requestAnimationFrame(()=>{spotlightFrame=false;if(spotlightTarget&&!panel.hidden)showSpotlight(spotlightTarget);});}
 window.addEventListener('resize',scheduleSpotlight);document.addEventListener('scroll',scheduleSpotlight,true);
 function stop(){
  const host=panel.parentElement;if(host&&host!==document.body)document.body.append(panel);
  panel.hidden=true;unmark();document.body.classList.remove('worker-guide-active');
  if(previousFocus?.isConnected&&!worker.classList.contains('hidden'))previousFocus.focus({preventScroll:true});
 }
 function mountPanel(target){
  const dialog=target?.closest('dialog[open]'),host=dialog||document.body;
  if(panel.parentElement!==host)host.append(panel);
 }
 function keepTargetVisible(target){
  if(!target)return;const scroller=target.closest('.worker-menu-content,.wc-body');
  if(scroller?.contains(target)&&scroller.scrollHeight>scroller.clientHeight+4){
   const tr=target.getBoundingClientRect(),sr=scroller.getBoundingClientRect(),guideTop=window.innerHeight-(panel.offsetHeight||220)-22,bottom=Math.min(sr.bottom-12,guideTop);let offset=0;
   if(tr.top<sr.top+12)offset=tr.top-(sr.top+16);else if(tr.bottom>bottom-10)offset=tr.bottom-(bottom-10);
   if(offset)scroller.scrollBy({top:offset,behavior:'smooth'});
  }else if(!target.closest('dialog[open]'))target.scrollIntoView({behavior:'smooth',block:'center'});
 }
 function render(){
  const steps=guideSteps(kind,formMode),step=steps[index];if(!step)return;
  count.textContent='Passaggio '+(index+1)+' di '+steps.length;title.textContent=step.title;copy.textContent=step.text;back.disabled=index===0;next.disabled=index===steps.length-1&&kind!=='colleague';next.textContent=kind==='colleague'?'Apri caricamento':'Avanti';
  unmark();const target=findTarget(step.target);
  if(target)revealWorkerTarget(target);
  mountPanel(target);panel.hidden=false;
  if(target)target.classList.add('worker-guide-target');keepTargetVisible(target);if(target){spotlightTimer=setTimeout(()=>{spotlightTimer=0;if(!panel.hidden&&target===findTarget(guideSteps(kind,formMode)[index]?.target))showSpotlight(target);},320);}
  title.focus({preventScroll:true});
 }
 function start(nextKind='presenze',options={}){
  const raw=nextKind||'presenze';kind=normKind(raw);formMode=raw==='daily-form'||!!options.form;
  previousFocus=options.focus||document.activeElement;index=Math.min(Math.max(0,Number(options.startAt)||0),guideSteps(kind,formMode).length-1);storage(key('seen',kind),'1');panel.hidden=false;document.body.classList.add('worker-guide-active');render();
 }
 function autoStart(nextKind,options={}){
  if(!currentUser||!isActiveWorker||storage(key('automatic'))!=='1')return false;
  const normalized=normKind(nextKind);if(storage(key('seen',normalized))==='1')return false;
  start(nextKind,{...options,automatic:true});return true;
 }
 window.workerGuides={start,guideSteps};
 back.onclick=()=>{if(index>0){index--;render();}};
 next.onclick=()=>{if(kind==='colleague'){stop();document.getElementById('uploadColleagueButton')?.click();return;}if(index<guideSteps(kind,formMode).length-1){index++;render();}};
 close.onclick=stop;
 disable.onclick=()=>{storage(key('automatic'),'0');stop();};
 document.addEventListener('click',event=>{const b=event.target.closest?.('[data-guide-launch]');if(b){event.preventDefault();start(b.dataset.guideLaunch,{focus:b,form:b.dataset.guideLaunch==='daily-form',startAt:b.closest('#presenceDialog')?1:0});}});
 document.getElementById('openPresenceDialog')?.addEventListener('click',()=>setTimeout(()=>autoStart('presenze',{form:true,startAt:1}),0));
 document.addEventListener('click',event=>{const b=event.target.closest?.('#uploadColleagueButton');if(b&&autoStart('colleague',{form:true})){event.preventDefault();event.stopImmediatePropagation();}},true);
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
