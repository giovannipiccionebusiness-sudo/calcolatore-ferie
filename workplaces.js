export const N153_WORKPLACES=Object.freeze(["Tribunale Penale Lecce", "Tribunale Civile Lecce", "Giudice di Pace Lecce", "Corte d’Appello Lecce", "Tribunale Minori Lecce", "Aula Bunker Lecce", "Tribunale/Procura Brindisi", "Tribunale Ordinario Taranto", "Tribunale Minori Taranto", "Procura Taranto", "Corte d’Appello Taranto"]);
export function workplaceLabel(p){return p.site==='N153'?(N153_WORKPLACES.includes(p.workplace)?p.workplace:'Sede da assegnare'):'';}
export function accountSiteLabel(p){const cdc={N153:'N153 · Corte d’Appello',N148:'N148 · ENAV',N154:'N154 · AQP'}[p.site]||p.site||'CDC da assegnare';return p.site==='N153'?cdc+' — '+workplaceLabel(p):cdc;}
export function createWorkplaceSelect(p,cdc,doc=document){
 const group=doc.createElement('label');group.className='doc-label';group.textContent='Sede di lavoro';
 const select=doc.createElement('select');select.className='doc-select';select.setAttribute('aria-label','Sede di lavoro di '+(p.full_name||'lavoratore'));
 for(const value of ['',...N153_WORKPLACES]){const o=doc.createElement('option');o.value=value;o.textContent=value||'Sede da assegnare';select.append(o);}select.value=p.workplace||'';
 const sync=()=>{group.hidden=cdc.value!=='N153';select.disabled=group.hidden;};cdc.addEventListener('change',sync);sync();group.append(select);return {group,select};
}
