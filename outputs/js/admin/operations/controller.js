import {renderView,esc,dateLocal,today} from './views.js';
import {icone} from '../icones.js';
import {CAMPOS_POR_FAMILIA,PREDEFINICOES,renderConflito,renderDetalhes,renderEscolhaDeTipo,renderMenuDeAcoes,visaoEfetiva} from './agenda-views.js';
import {FAMILIAS,JANELA,deslocarData,familiaDe,verificarReserva} from './agenda-layout.js';

export function moneyToCents(value){
  if(value==null||value==='')return null;
  const text=String(value).trim();if(!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/.test(text))throw new Error('Informe um valor monetário válido.');
  const normalized=text.includes(',')?text.replaceAll('.','').replace(',','.'):text;
  const number=Number(normalized);if(!Number.isFinite(number)||number<0)throw new Error('Informe um valor monetário válido.');return Math.round(number*100);
}
const integer=(value,fallback=null)=>value===''||value==null?fallback:Number(value);
const bool=value=>value==='true'?true:value==='false'?false:null;
function objectData(source){if(source instanceof FormData){const result=Object.fromEntries(source);result.roles=source.getAll('roles');return result;}return {...source};}
export function payloadFromForm(kind,source){
  const v=objectData(source);const base={};if(v.id)base.id=v.id;
  if(kind==='room')return {...base,code:v.code,name:v.name,floor:v.floor||'',description:v.description||'',area:v.area||'',capacity:integer(v.capacity),type:v.type,accessible:bool(v.accessible),status:v.status,notes:v.notes||'',opens_at:v.opens_at||'',closes_at:v.closes_at||'',hourly_rate_cents:moneyToCents(v.hourly_rate_reais)};
  if(kind==='person')return {...base,display_name:v.display_name,email:v.email||'',phone:v.phone||'',roles:Array.isArray(v.roles)?v.roles:typeof v.roles==='string'?[v.roles]:[]};
  if(kind==='definition')return {...base,title:v.title,kind:v.kind};
  if(kind==='offering')return {...base,title:v.title,definition_id:v.definition_id,professional_id:v.professional_id||null,capacity:integer(v.capacity)};
  if(kind==='enrollment')return {...base,profile_id:v.profile_id,offering_id:v.offering_id,status:v.status};
  if(kind==='participant')return {...base,profile_id:v.profile_id,schedule_id:v.schedule_id,role:v.role||'participant',status:v.status,enrollment_id:v.enrollment_id||null};
  if(kind==='schedule'){
    const payload={...base,title:v.title,kind:v.kind,offering_id:v.offering_id||null,room_id:v.mode==='online'?null:v.room_id,professional_id:v.professional_id||null,client_id:v.client_id||null,mode:v.mode,starts_at:v.starts_at,ends_at:v.ends_at,participants:integer(v.participants,1),online_url:v.online_url||'',price_cents:moneyToCents(v.price_reais),setup_minutes:integer(v.setup_minutes,0),teardown_minutes:integer(v.teardown_minutes,0),notes:v.notes||'',scope:v.scope||'occurrence'};
    payload.requirements=Object.entries(v).filter(([key,value])=>key.startsWith('requirement__')&&Number(value)>0).map(([key,value])=>({item_id:key.slice('requirement__'.length),quantity:integer(value,1)}));
    if(!payload.requirements.length&&v.req_item_id)payload.requirements=[{item_id:v.req_item_id,quantity:integer(v.req_quantity,1)}];
    const extraIndexes=[...new Set(Object.keys(v).map(key=>/^extra_name_(\d+)$/.exec(key)?.[1]).filter(value=>value!=null))];
    payload.extras=extraIndexes.map(index=>({name:String(v[`extra_name_${index}`]||'').trim(),quantity:integer(v[`extra_quantity_${index}`],1),unit_price_cents:moneyToCents(v[`extra_price_reais_${index}`])||0})).filter(extra=>extra.name);
    if(!payload.extras.length&&v.extra_name)payload.extras=[{name:v.extra_name,quantity:integer(v.extra_quantity,1),unit_price_cents:moneyToCents(v.extra_price_reais)||0}];
    if(v.recurrence_frequency)payload.recurrence={frequency:v.recurrence_frequency,interval:integer(v.recurrence_interval,1),until:v.recurrence_until,month_policy:v.month_policy||undefined};
    return payload;
  }
  if(kind==='cancel')return {id:v.id,scope:v.scope||'occurrence',reason:v.reason,financial_action:v.financial_action||'retain'};
  if(kind==='item')return {...base,name:v.name,category:v.category||'',tracking_mode:v.tracking_mode};
  if(kind==='receive')return {item_id:v.item_id,location_id:v.location_id,quantity:integer(v.quantity,1),condition:v.condition,reason:v.reason,asset_code:v.asset_code||'',brand:v.brand||'',model:v.model||'',serial_number:v.serial_number||'',acquired_at:v.acquired_at||''};
  if(kind==='move')return {item_id:v.item_id||null,asset_id:v.asset_id||null,from_location_id:v.from_location_id,to_location_id:v.to_location_id,quantity:integer(v.quantity,1),reason:v.reason,allow_reserved:v.allow_reserved==='on'};
  if(kind==='condition')return {item_id:v.item_id||null,asset_id:v.asset_id||null,location_id:v.location_id,quantity:integer(v.quantity,1),from_condition:v.from_condition,condition:v.condition,reason:v.reason};
  if(kind==='maintenance')return {...base,asset_id:v.asset_id||null,room_id:v.room_id||null,description:v.description,due_date:v.due_date||null,status:v.status||'open',allow_booked:v.allow_booked==='on'};
  if(kind==='entry')return {...base,direction:v.direction,profile_id:v.profile_id||null,schedule_id:v.schedule_id||null,description:v.description,category:v.category||'',cost_center:v.cost_center||'',amount_cents:moneyToCents(v.amount_reais),due_date:v.due_date,receipt_url:v.receipt_url||'',recurrence:v.recurrence||null};
  if(kind==='payment')return {entry_id:v.entry_id,amount_cents:moneyToCents(v.amount_reais),method:v.method,paid_at:v.paid_at||new Date().toISOString()};
  if(kind==='refund')return {payment_id:v.id,amount_cents:integer(v.amount_cents),reason:v.reason};
  if(kind==='rule')return {...base,name:v.name,professional_id:v.professional_id||null,definition_id:v.definition_id||null,offering_id:v.offering_id||null,professional_basis_points:Math.round(Number(v.professional_percent)*100),active:v.active!=='false'};
  if(kind==='recurring')return {through:v.through};
  throw new Error('Formulário desconhecido.');
}

const val=(row,key,fallback='')=>esc(row?.[key]??fallback);
const reais=cents=>cents==null?'':(cents/100).toFixed(2).replace('.',',');
const opt=(value,name,current)=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(name)}</option>`;
const select=(name,label,rows,current='',empty='Selecione')=>`<label>${esc(label)}<select name="${name}" ${empty?'':'required'}>${empty?`<option value="">${esc(empty)}</option>`:''}${rows.map(row=>opt(row.id,row.name||row.title||row.display_name||row.code,row.id===current?row.id:current)).join('')}</select></label>`;
const input=(name,label,value='',type='text',attrs='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const choice=(name,label,items,current,attrs='')=>`<label>${esc(label)}<select name="${name}" ${attrs}>${items.map(([key,text])=>opt(key,text,current)).join('')}</select></label>`;
const area=(name,label,value='')=>`<label class="op-span">${esc(label)}<textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
function locations(state){return [{id:'storage',name:'Depósito'},...state.rooms];}
function professions(state){return state.profiles.filter(p=>p.roles?.some(role=>['professional','profissional'].includes(role)));}
function formHtml(kind,state,row={},seed={}){
  row={...row,...seed};const id=row.id?`<input type="hidden" name="id" value="${esc(row.id)}">`:'';
  if(kind==='room')return id+input('code','Código',val(row,'code'),'text','required')+input('name','Nome',val(row,'name'),'text','required')+input('floor','Andar / localização',val(row,'floor'))+input('area','Metragem',val(row,'area'),'number','min="0" step="0.1"')+input('capacity','Capacidade máxima',val(row,'capacity'),'number','min="1"')+choice('type','Uso principal',[['individual','Atendimento individual'],['collective','Atendimento coletivo'],['course','Curso'],['activity','Atividade'],['lecture','Palestra'],['event','Evento'],['multiuso','Multiuso']],row.type||'individual')+choice('accessible','Acessível para cadeirantes',[['','A confirmar'],['true','Sim'],['false','Não']],row.accessible==null?'':String(row.accessible))+choice('status','Situação física',[['unconfirmed','A confirmar'],['available','Disponível'],['maintenance','Manutenção'],['unavailable','Indisponível']],row.status||'unconfirmed')+input('opens_at','Abertura',val(row,'opens_at','08:00'),'time')+input('closes_at','Encerramento',val(row,'closes_at','22:00'),'time')+input('hourly_rate_reais','Tarifa por hora (R$)',reais(row.hourly_rate_cents),'text','inputmode="decimal"')+area('description','Descrição',row.description)+area('notes','Observações',row.notes);
  if(kind==='person')return id+input('display_name','Nome completo',val(row,'display_name'),'text','required')+input('email','E-mail',val(row,'email'),'email')+input('phone','Telefone',val(row,'phone'),'tel')+`<fieldset class="op-span"><legend>Papéis desta pessoa</legend>${[['client','Cliente'],['student','Aluno'],['participant','Participante'],['professional','Profissional']].map(([key,text])=>`<label class="op-check"><input type="checkbox" name="roles" value="${key}" ${row.roles?.includes(key)?'checked':''}>${text}</label>`).join('')}</fieldset>`;
  if(kind==='definition')return id+input('title','Nome da atividade',val(row,'title'),'text','required')+choice('kind','Tipo',[['appointment','Atendimento'],['course','Curso'],['activity','Atividade'],['workshop','Workshop'],['lecture','Palestra'],['event','Evento'],['rental','Locação'],['group','Grupo'],['cultural','Atividade cultural']],row.kind||'activity');
  if(kind==='offering')return id+input('title','Nome da turma / oferta',val(row,'title'),'text','required')+select('definition_id','Atividade',state.activity_definitions,row.definition_id,'')+select('professional_id','Profissional responsável',professions(state),row.professional_id)+input('capacity','Capacidade',val(row,'capacity'),'number','min="1"');
  if(kind==='enrollment')return id+select('profile_id','Pessoa',state.profiles,row.profile_id,'')+select('offering_id','Turma / oferta',state.activity_offerings,row.offering_id||seed.offering_id,'')+choice('status','Situação',[['active','Ativa'],['waitlist','Lista de espera'],['completed','Concluída'],['cancelled','Cancelada']],row.status||'active');
  if(kind==='participant')return id+`<input type="hidden" name="schedule_id" value="${esc(row.schedule_id||seed.schedule_id)}">`+select('profile_id','Pessoa',state.profiles,row.profile_id,'')+choice('role','Participação',[['participant','Participante'],['client','Cliente'],['student','Aluno'],['professional','Profissional']],row.role||'participant')+choice('status','Situação',[['confirmed','Confirmada'],['present','Presente'],['absent','Ausente'],['cancelled','Cancelada']],row.status||'confirmed')+select('enrollment_id','Inscrição relacionada',state.enrollments.map(e=>({id:e.id,name:`${state.profiles.find(p=>p.id===e.profile_id)?.display_name||'Pessoa'} · ${state.activity_offerings.find(o=>o.id===e.offering_id)?.title||'Oferta'}`})),row.enrollment_id);
  if(kind==='schedule'){
    const starts=row.starts_at?dateLocal(row.starts_at):`${seed.date||today()}T${String(seed.hour||9).padStart(2,'0')}:00`;const ends=row.ends_at?dateLocal(row.ends_at):`${seed.date||today()}T${String((seed.hour||9)+1).padStart(2,'0')}:00`;
    const requirements=`<fieldset class="op-span op-requirements"><legend>Recursos necessários</legend><p class="op-field-hint">Informe somente o que deve estar disponível para esta atividade.</p>${state.inventory_items.map(item=>input(`requirement__${item.id}`,item.name,row.requirements?.find(required=>required.item_id===item.id)?.quantity||'','number','min="0" placeholder="0"')).join('')||'<p class="op-muted">Cadastre itens no Inventário para planejar recursos.</p>'}</fieldset>`;
    const extraCount=Math.max(3,row.extras?.length||0);const extras=`<fieldset class="op-span op-extras"><legend>Serviços adicionais</legend><p class="op-field-hint">Coffee break, equipamento extra ou preparação especial.</p>${Array.from({length:extraCount},(_,index)=>{const extra=row.extras?.[index]||{};return `<div class="op-extra-row">${input(`extra_name_${index}`,`Serviço ${index+1}`,extra.name||'')}${input(`extra_quantity_${index}`,'Quantidade',extra.quantity||'','number','min="1"')}${input(`extra_price_reais_${index}`,'Valor unitário (R$)',reais(extra.unit_price_cents),'text','inputmode="decimal"')}</div>`;}).join('')}</fieldset>`;
    return id+input('title','Título',val(row,'title'),'text','required')+choice('kind','Tipo',[['appointment','Atendimento'],['course','Curso'],['activity','Atividade'],['workshop','Workshop'],['lecture','Palestra'],['event','Evento'],['rental','Locação'],['group','Grupo'],['cultural','Cultural']],row.kind||'appointment')+select('offering_id','Turma / oferta',state.activity_offerings,row.offering_id)+choice('mode','Modalidade',[['presencial','Presencial'],['online','Online']],row.mode||'presencial')+select('room_id','Sala',state.rooms.filter(r=>r.status==='available'),row.room_id||seed.room)+select('professional_id','Profissional',professions(state),row.professional_id)+select('client_id','Cliente / responsável',state.profiles,row.client_id)+input('starts_at','Início',starts,'datetime-local','required')+input('ends_at','Fim',ends,'datetime-local','required')+input('participants','Participantes previstos',row.participants||1,'number','min="1" required')+input('setup_minutes','Preparação (minutos)',row.setup_minutes||0,'number','min="0"')+input('teardown_minutes','Desmontagem (minutos)',row.teardown_minutes||0,'number','min="0"')+input('online_url','Link online',val(row,'online_url'),'url')+input('price_reais','Valor (R$)',reais(row.price_cents),'text','inputmode="decimal"')+requirements+extras+(row.series_id?choice('scope','Aplicar alteração a',[['occurrence','Somente esta ocorrência'],['future','Esta e próximas'],['series','Toda a série planejada']],row.scope||'occurrence'):`<fieldset class="op-span"><legend>Recorrência opcional</legend>${choice('recurrence_frequency','Frequência',[['','Não repetir'],['daily','Diária'],['weekly','Semanal'],['fortnightly','Quinzenal'],['monthly','Mensal'],['custom','Personalizada']],'')} ${input('recurrence_interval','Intervalo',1,'number','min="1"')} ${input('recurrence_until','Repetir até','','date')} ${choice('month_policy','Dias 29–31',[['','Não se aplica'],['skip','Pular mês sem esse dia'],['last_day','Usar o último dia']], '')}</fieldset>`)+area('notes','Observações',row.notes)+(row.id?`<div class="op-span op-dialog-commands"><button type="button" data-op-action="participant" data-schedule="${esc(row.id)}">Adicionar participante</button><button type="button" data-op-action="cancel" data-id="${esc(row.id)}">Cancelar ocorrência</button></div>`:'');
  }
  if(kind==='cancel')return `<input type="hidden" name="id" value="${esc(row.id)}">`+choice('scope','Cancelar',[['occurrence','Somente esta ocorrência'],['future','Esta e próximas'],['series','Toda a série planejada']],row.series_id?'occurrence':'occurrence')+choice('financial_action','Tratamento de valores em aberto',[['retain','Manter cobrança / tratar depois'],['reverse_unpaid','Cancelar valores ainda não pagos']],'retain')+area('reason','Motivo do cancelamento','');
  if(kind==='item')return id+input('name','Nome do item',val(row,'name'),'text','required')+input('category','Categoria',val(row,'category'))+choice('tracking_mode','Forma de controle',[['quantity','Por quantidade'],['asset','Patrimônio individual']],row.tracking_mode||'quantity');
  if(kind==='receive')return select('item_id','Item',state.inventory_items,row.item_id,'')+select('location_id','Local',locations(state),row.location_id||'storage','')+input('quantity','Quantidade',row.quantity||1,'number','min="1" required')+choice('condition','Condição',[['available','Disponível'],['damaged','Danificado'],['maintenance','Manutenção']],row.condition||'available')+input('asset_code','Código patrimonial',val(row,'asset_code'))+input('brand','Marca',val(row,'brand'))+input('model','Modelo',val(row,'model'))+input('serial_number','Número de série',val(row,'serial_number'))+input('acquired_at','Data de aquisição',val(row,'acquired_at'),'date')+area('reason','Motivo / origem',row.reason||'Entrada');
  if(kind==='move')return select('item_id','Item',state.inventory_items,row.item_id)+select('asset_id','Patrimônio individual',state.inventory_assets.map(a=>({id:a.id,name:`${a.asset_code} · ${state.inventory_items.find(i=>i.id===a.item_id)?.name||''}`})),row.asset_id)+select('from_location_id','Origem',locations(state),row.from_location_id,'')+select('to_location_id','Destino',locations(state),row.to_location_id||seed.destination,'')+input('quantity','Quantidade',row.quantity||1,'number','min="1" required')+area('reason','Motivo',row.reason||'')+`<label class="op-span op-check"><input type="checkbox" name="allow_reserved">Confirmo que revisei as reservas futuras afetadas</label>`;
  if(kind==='condition')return select('item_id','Item',state.inventory_items,row.item_id||seed.item)+select('asset_id','Patrimônio individual',state.inventory_assets.map(a=>({id:a.id,name:`${a.asset_code} · ${state.inventory_items.find(i=>i.id===a.item_id)?.name||''}`})),row.asset_id)+select('location_id','Local atual',locations(state),row.location_id,'')+input('quantity','Quantidade',row.quantity||1,'number','min="1" required')+choice('from_condition','Condição atual',[['available','Disponível'],['damaged','Danificado'],['maintenance','Manutenção'],['lost','Perdido'],['retired','Baixado']],row.from_condition||'available')+choice('condition','Nova condição',[['available','Disponível'],['damaged','Danificado'],['maintenance','Manutenção'],['lost','Perdido'],['retired','Baixado']],row.condition||'damaged')+area('reason','Motivo',row.reason||'');
  if(kind==='maintenance')return id+select('asset_id','Equipamento',state.inventory_assets.map(a=>({id:a.id,name:a.asset_code})),row.asset_id||seed.asset)+select('room_id','Sala',state.rooms,row.room_id)+input('description','Problema / serviço',row.description||row.reason||'','text','required')+input('due_date','Prazo',val(row,'due_date'),'date')+choice('status','Situação',[['open','Aberta'],['completed','Concluída']],row.status||'open')+`<label class="op-span op-check"><input type="checkbox" name="allow_booked">Confirmo que revisei as reservas futuras afetadas</label>`;
  if(kind==='entry')return id+choice('direction','Tipo',[['receivable','Receita a receber'],['payable','Despesa / valor a pagar']],row.direction||'receivable')+input('description','Descrição',val(row,'description'),'text','required')+select('profile_id','Pessoa / fornecedor',state.profiles,row.profile_id)+select('schedule_id','Atividade relacionada',state.schedule_items.map(s=>({id:s.id,name:`${s.title} · ${dateLocal(s.starts_at)}`})),row.schedule_id)+input('amount_reais','Valor (R$)',reais(row.amount_cents),'text','inputmode="decimal" required')+input('due_date','Vencimento',row.due_date||today(),'date','required')+input('category','Categoria',val(row,'category'))+input('cost_center','Centro de custo',val(row,'cost_center'))+input('receipt_url','Comprovante privado (URL)',val(row,'receipt_url'),'url')+choice('recurrence','Recorrência',[['','Não repetir'],['monthly','Mensal']],row.recurrence||'');
  if(kind==='payment')return `<input type="hidden" name="entry_id" value="${esc(row.entry_id||seed.entry)}">`+input('amount_reais','Valor pago (R$)',reais(row.amount_cents),'text','inputmode="decimal" required')+choice('method','Forma de pagamento',[['pix','Pix'],['card','Cartão'],['cash','Dinheiro'],['transfer','Transferência'],['other','Outra']],row.method||'pix')+input('paid_at','Data e hora',row.paid_at?dateLocal(row.paid_at):dateLocal(new Date()),'datetime-local','required');
  if(kind==='refund')return `<input type="hidden" name="id" value="${esc(row.id)}"><input type="hidden" name="amount_cents" value="${esc(row.amount_cents)}">`+input('amount_display','Valor a estornar',reais(row.amount_cents),'text','disabled')+area('reason','Motivo','');
  if(kind==='rule')return id+input('name','Nome da regra',val(row,'name'),'text','required')+select('professional_id','Profissional',professions(state),row.professional_id)+select('definition_id','Atividade',state.activity_definitions,row.definition_id)+select('offering_id','Turma / oferta',state.activity_offerings,row.offering_id)+input('professional_percent','Percentual do profissional',row.professional_basis_points!=null?row.professional_basis_points/100:'','number','min="0" max="100" step="0.01" required')+choice('active','Situação',[['true','Ativa'],['false','Inativa']],row.active===false?'false':'true');
  if(kind==='recurring')return input('through','Gerar obrigações até',today(),'date','required');
  return '<p>Formulário indisponível.</p>';
}
const commandFor={room:'room.save',person:'person.save',definition:'definition.save',offering:'offering.save',enrollment:'enrollment.save',participant:'participant.save',schedule:'schedule.save',cancel:'schedule.cancel',item:'inventory.item.save',receive:'inventory.receive',move:'inventory.move',condition:'inventory.condition',maintenance:'maintenance.save',entry:'finance.entry.save',payment:'finance.payment',refund:'finance.refund',rule:'finance.rule.save',recurring:'finance.generateRecurring'};
const collections={room:'rooms',person:'profiles',definition:'activity_definitions',offering:'activity_offerings',enrollment:'enrollments',participant:'schedule_participants',schedule:'schedule_items',cancel:'schedule_items',item:'inventory_items',maintenance:'maintenance_orders',entry:'financial_entries',refund:'payments',rule:'split_rules'};
const titles={room:'Sala',person:'Pessoa',definition:'Tipo de atividade',offering:'Turma ou oferta',enrollment:'Inscrição',participant:'Participante',schedule:'Atividade na agenda',cancel:'Cancelar atividade',item:'Item de inventário',receive:'Entrada de item',move:'Movimentação',condition:'Condição do recurso',maintenance:'Manutenção',entry:'Lançamento financeiro',payment:'Pagamento',refund:'Estorno',rule:'Regra de repasse',recurring:'Despesas recorrentes'};

const titulosDaAgenda={novo:'Novo agendamento',reagendar:'Reagendar atividade',duplicar:'Duplicar atividade'};
const CAMPOS_COPIAVEIS=['title','kind','offering_id','room_id','professional_id','client_id','mode','starts_at','ends_at','participants','online_url','price_cents','setup_minutes','teardown_minutes','notes','requirements','extras'];

/*
 * Qual parte do formulário de agenda cada bloco representa. Os blocos são os
 * filhos diretos do corpo do diálogo, na ordem em que formHtml os escreve.
 */
function chaveDoBloco(bloco){
  if(bloco.matches('input[type="hidden"]'))return null;
  if(bloco.classList.contains('op-requirements'))return 'recursos';
  if(bloco.classList.contains('op-extras'))return 'extras';
  if(bloco.querySelector('[name="recurrence_frequency"]'))return 'recorrencia';
  if(bloco.classList.contains('op-dialog-commands')||bloco.dataset.opFixo!=null)return null;
  const nome=bloco.querySelector('[name]')?.getAttribute('name');
  return nome==='scope'?null:nome||null;
}

export function createOperationsController({root,client,onNavigate=()=>{},janela=globalThis.window}={}){
  if(!root||!client)throw new TypeError('Painel e cliente operacional são obrigatórios.');
  const dialog=root.querySelector('[data-op-dialog]'),form=root.querySelector('[data-op-form]'),body=root.querySelector('[data-op-form-body]'),title=root.querySelector('[data-op-dialog-title]'),error=root.querySelector('[data-op-form-error]'),status=root.querySelector('[data-op-status]');
  const drawer=root.querySelector('[data-op-drawer]'),drawerBody=root.querySelector('[data-op-drawer-corpo]'),menu=root.querySelector('[data-op-menu-painel]');
  const consulta=query=>janela?.matchMedia?.(query);
  const estreita=()=>Boolean(consulta('(max-width: 819px)')?.matches);
  const filters={date:today(),view:consulta('(min-width: 1024px)')?.matches===false?'day':'week',room:'',familia:'',situacao:'',profissional:'',search:'',direction:'',selecionado:''};
  let currentKind='',detalheId='',origemDetalhe=null,menuId='',origemMenu=null,buscaEspera=0,sementeNova={},recebidos=null;

  /* O mesmo evento aparece em mais de uma tela (Visão geral e Agenda): o foco volta para o que está à vista. */
  const visivel=seletor=>[...root.querySelectorAll(seletor)].find(elemento=>elemento.offsetParent!==null)||null;

  /* ------------------------------------------------------------ desenho */

  /*
   * Redesenhar troca o HTML inteiro da tela. Sem isto, quem digitava na busca
   * perdia o campo a cada letra, e o teclado voltava ao começo da página.
   */
  function render(){
    const ativo=root.ownerDocument?.activeElement;
    const filtroAtivo=ativo?.dataset?.opFilter;
    const cursor=filtroAtivo&&typeof ativo.selectionStart==='number'?[ativo.selectionStart,ativo.selectionEnd]:null;
    const state=client.snapshot;
    const opcoes={...filters,agora:Date.now(),estreito:estreita(),recebidos};
    for(const node of root.querySelectorAll('[data-op-view]'))node.innerHTML=renderView(node.dataset.opView,state,opcoes);
    if(filtroAtivo){
      const alvo=[...root.querySelectorAll(`[data-op-filter="${filtroAtivo}"]`)].find(campo=>!campo.closest('[hidden]'));
      if(alvo){alvo.focus({preventScroll:true});if(cursor)try{alvo.setSelectionRange(...cursor);}catch{/* campos de data não têm cursor */}}
    }
    if(detalheId){
      const conteudo=renderDetalhes(state,detalheId,{agora:Date.now()});
      if(conteudo)drawerBody.innerHTML=conteudo;else fecharDetalhes();
    }
  }

  /* ------------------------------------------------------------ diálogo */

  function open(kind,id='',seed={}){
    const rows=client.snapshot?.[collections[kind]]||[];const row=id?rows.find(item=>item.id===id)||{}:{};
    currentKind=kind;title.textContent=titles[kind]||'Editar';body.innerHTML=formHtml(kind,client.snapshot,row,seed);error.textContent='';
    fecharMenu();
    if(!dialog.open)dialog.showModal();
    body.querySelector('input:not([type="hidden"]),select,textarea')?.focus();
    return row;
  }
  function close(){if(dialog.open)dialog.close();currentKind='';}

  function abrirEscolhaDeTipo(semente={}){
    sementeNova=semente;currentKind='';fecharMenu();
    title.textContent=titulosDaAgenda.novo;body.innerHTML=renderEscolhaDeTipo();error.textContent='';
    form.dataset.opEtapa='tipo';
    if(!dialog.open)dialog.showModal();
    body.querySelector('[data-op-novo-tipo]')?.focus();
  }

  /*
   * Cada tipo mostra só os campos que usa. Os outros continuam no formulário,
   * com seus valores, atrás de "Mostrar todos os campos": nada se perde.
   */
  function aplicarPerfil(familia,{novo=false}={}){
    delete form.dataset.opEtapa;
    const campos=new Set(CAMPOS_POR_FAMILIA[familia]||[]);
    for(const bloco of [...body.children]){const chave=chaveDoBloco(bloco);if(chave)bloco.hidden=!campos.has(chave);}
    const predefinicao=PREDEFINICOES[familia]||{};
    for(const [nome,valor] of Object.entries(predefinicao)){const campo=body.querySelector(`[name="${nome}"]`);if(campo&&(novo||!campo.value))campo.value=valor;}
    const {rotulo,icone:nomeIcone}=FAMILIAS[familia];
    body.insertAdjacentHTML('afterbegin',`<div class="op-span ag-form-tipo" data-op-fixo>${icone(nomeIcone)}<strong>${esc(rotulo)}</strong>${novo?'<button type="button" class="ag-botao" data-op-trocar-tipo>Trocar tipo</button>':''}<button type="button" class="ag-botao ag-botao-leve" data-op-mostrar-campos aria-expanded="false">Mostrar todos os campos</button></div><div class="op-span ag-conflito-form" data-op-conflito data-op-fixo role="status" aria-live="polite" hidden></div>`);
    atualizarConflito();
  }

  function abrirAgendamento(familia,{id='',semente={},modo='novo'}={}){
    const row=open('schedule',id,semente);
    if(modo!=='editar')title.textContent=titulosDaAgenda[modo]||titles.schedule;
    aplicarPerfil(familia||familiaDe({...row,...semente}),{novo:modo==='novo'});
    if(modo==='reagendar')body.querySelector('[name="starts_at"]')?.focus();
    else body.querySelector('[data-op-fixo] ~ label:not([hidden]) :is(input,select,textarea)')?.focus();
  }

  function atualizarConflito(){
    const regiao=body.querySelector('[data-op-conflito]');if(!regiao)return;
    const dados=Object.fromEntries(new FormData(form));
    const resultado=verificarReserva(client.snapshot,{id:dados.id,room_id:dados.room_id,professional_id:dados.professional_id,mode:dados.mode,starts_at:dados.starts_at,ends_at:dados.ends_at,setup_minutes:dados.setup_minutes,teardown_minutes:dados.teardown_minutes,participants:dados.participants});
    regiao.innerHTML=renderConflito(resultado);regiao.hidden=!resultado.mensagens.length;
  }

  async function run(type,payload,message='Alteração salva.') {status.textContent='Salvando…';try{const result=await client.command(type,payload);status.textContent=message;render();return result;}catch(cause){status.textContent=cause.message;throw cause;}}
  async function onSubmit(event){event.preventDefault();if(!currentKind)return;const submit=form.querySelector('[type="submit"]');submit.disabled=true;error.textContent='';try{await run(commandFor[currentKind],payloadFromForm(currentKind,new FormData(form)));close();}catch(cause){error.textContent=cause.message;}finally{submit.disabled=false;}}

  /* ------------------------------------------------------------ detalhes (painel lateral) */

  function abrirDetalhes(id,origem){
    const conteudo=renderDetalhes(client.snapshot,id,{agora:Date.now()});if(!conteudo||!drawer)return;
    detalheId=id;filters.selecionado=id;origemDetalhe=origem||null;
    drawerBody.innerHTML=conteudo;drawer.hidden=false;root.dataset.opDetalhe='aberto';
    fecharMenu();render();
    drawer.querySelector('#op-drawer-titulo')?.focus();
  }
  function fecharDetalhes({devolverFoco=true}={}){
    if(!detalheId||!drawer)return;
    const id=detalheId;detalheId='';filters.selecionado='';drawer.hidden=true;drawerBody.innerHTML='';delete root.dataset.opDetalhe;
    render();
    if(devolverFoco){const alvo=origemDetalhe?.isConnected?origemDetalhe:visivel(`[data-op-action="detalhes"][data-id="${CSS.escape(id)}"]`);alvo?.focus();}
    origemDetalhe=null;
  }

  /* ------------------------------------------------------------ menu "⋯" */

  function abrirMenu(id,gatilho){
    if(!menu)return;
    if(menuId===id&&!menu.hidden){fecharMenu();return;}
    menu.innerHTML=renderMenuDeAcoes(client.snapshot,id);if(!menu.innerHTML)return;
    menuId=id;origemMenu=gatilho;menu.hidden=false;gatilho.setAttribute('aria-expanded','true');
    const caixa=gatilho.getBoundingClientRect(),largura=menu.offsetWidth||200,altura=menu.offsetHeight||220;
    const esquerda=Math.max(8,Math.min(caixa.right-largura,(janela?.innerWidth||1200)-largura-8));
    const acima=caixa.bottom+altura+8>(janela?.innerHeight||800);
    menu.style.left=`${esquerda}px`;menu.style.top=`${acima?Math.max(8,caixa.top-altura-4):caixa.bottom+4}px`;
    menu.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }
  function fecharMenu({devolverFoco=false}={}){
    if(!menu||menu.hidden)return;
    menu.hidden=true;origemMenu?.setAttribute?.('aria-expanded','false');
    if(devolverFoco&&origemMenu?.isConnected)origemMenu.focus();
    menuId='';origemMenu=null;
  }

  /* ------------------------------------------------------------ cliques em áreas vazias */

  const iso=(dia,minutos)=>new Date(Date.parse(`${dia}T${String(Math.floor(minutos/60)).padStart(2,'0')}:${String(minutos%60).padStart(2,'0')}:00-03:00`)).toISOString();
  const arredondar=minutos=>Math.max(JANELA.inicio,Math.min(JANELA.fim-60,Math.floor(minutos/30)*30));
  function sementeDoHorario(dia,minutos,room_id=''){const inicio=arredondar(minutos);return {starts_at:iso(dia,inicio),ends_at:iso(dia,inicio+60),...(room_id?{room_id}:{})};}

  /* ------------------------------------------------------------ eventos */

  async function onClick(event){
    const alvo=event.target;
    if(menu&&!menu.hidden&&!alvo.closest('[data-op-menu-painel]')&&!alvo.closest('[data-op-menu]'))fecharMenu();
    if(alvo.closest('[data-op-close]')){close();return;}
    if(alvo.closest('[data-op-drawer-fechar]')){fecharDetalhes();return;}

    const agenda=alvo.closest('[data-op-agenda]');
    if(agenda){
      const comando=agenda.dataset.opAgenda;
      if(comando==='hoje')filters.date=today();
      else if(comando==='anterior'||comando==='proximo')filters.date=deslocarData(visaoEfetiva(filters.view,estreita()),filters.date,comando==='anterior'?-1:1);
      else if(comando==='limpar-filtros'){filters.familia='';filters.situacao='';filters.profissional='';}
      else if(comando==='calendario'){const campo=agenda.parentElement?.querySelector('[data-op-filter="date"]');try{campo?.showPicker();}catch{campo?.focus();}return;}
      render();
      if(comando!=='limpar-filtros')root.querySelector(`[data-op-agenda="${comando}"]`)?.focus();
      return;
    }
    const view=alvo.closest('[data-op-calendar-view]');if(view){filters.view=view.dataset.opCalendarView;render();root.querySelector(`[data-op-calendar-view="${filters.view}"]`)?.focus();return;}
    const day=alvo.closest('[data-op-day]');if(day){filters.date=day.dataset.opDay;filters.view='day';render();root.querySelector(`[data-op-day="${filters.date}"][aria-pressed="true"]`)?.focus();return;}

    const menuGatilho=alvo.closest('[data-op-menu]');if(menuGatilho){abrirMenu(menuGatilho.dataset.opMenu,menuGatilho);return;}
    const tipo=alvo.closest('[data-op-novo-tipo]');if(tipo){abrirAgendamento(tipo.dataset.opNovoTipo,{semente:sementeNova,modo:'novo'});return;}
    if(alvo.closest('[data-op-trocar-tipo]')){const dados=Object.fromEntries(new FormData(form));abrirEscolhaDeTipo({...sementeNova,starts_at:dados.starts_at?new Date(`${dados.starts_at}:00-03:00`).toISOString():sementeNova.starts_at,ends_at:dados.ends_at?new Date(`${dados.ends_at}:00-03:00`).toISOString():sementeNova.ends_at,room_id:dados.room_id||sementeNova.room_id,title:dados.title||''});return;}
    const mostrar=alvo.closest('[data-op-mostrar-campos]');if(mostrar){for(const bloco of body.children)if(chaveDoBloco(bloco))bloco.hidden=false;mostrar.setAttribute('aria-expanded','true');mostrar.hidden=true;return;}
    const sugestao=alvo.closest('[data-op-sugestao]');
    if(sugestao){
      if(sugestao.dataset.opSugestao==='horario'){form.elements.starts_at.value=sugestao.dataset.inicio;form.elements.ends_at.value=sugestao.dataset.fim;}
      else{const sala=form.elements.room_id;sala.value=sugestao.dataset.sala;}
      atualizarConflito();body.querySelector('[name="starts_at"]')?.focus();return;
    }

    const trilha=alvo.closest('[data-op-trilha][data-reservavel]');
    if(trilha&&alvo===trilha){const caixa=trilha.getBoundingClientRect();const minutos=JANELA.inicio+((event.clientX-caixa.left)/caixa.width)*(JANELA.fim-JANELA.inicio);abrirEscolhaDeTipo(sementeDoHorario(trilha.dataset.dia,minutos,trilha.dataset.opTrilha));return;}
    const coluna=alvo.closest('[data-op-coluna]');
    if(coluna&&alvo===coluna){const caixa=coluna.getBoundingClientRect();const hora=parseFloat(getComputedStyle(coluna).getPropertyValue('--hora'))||40;abrirEscolhaDeTipo(sementeDoHorario(coluna.dataset.opColuna,JANELA.inicio+((event.clientY-caixa.top)/hora)*60));return;}

    const target=alvo.closest('[data-op-action]');if(!target||target.disabled)return;const kind=target.dataset.opAction,id=target.dataset.id||'';
    fecharMenu();
    if(kind==='detalhes'){abrirDetalhes(id,target);return;}
    if(kind==='novo-agendamento'){abrirEscolhaDeTipo(target.dataset.room?{room_id:target.dataset.room}:{});return;}
    if(kind==='reagendar'){abrirAgendamento(null,{id,modo:'reagendar'});return;}
    if(kind==='duplicar'){const original=client.snapshot.schedule_items.find(item=>item.id===id);if(!original)return;const copia=Object.fromEntries(CAMPOS_COPIAVEIS.filter(campo=>original[campo]!=null).map(campo=>[campo,structuredClone(original[campo])]));abrirAgendamento(familiaDe(original),{semente:copia,modo:'duplicar'});return;}
    if(kind==='schedule'&&id){abrirAgendamento(null,{id,modo:'editar'});return;}
    if(kind==='setup'){if(confirm('Criar os dez cadastros provisórios de sala? Eles continuarão indisponíveis até a confirmação dos dados.'))await run('setup.rooms',{},'Dez salas preparadas para conferência.');return;}
    if(kind==='complete'){if(confirm('Marcar esta atividade como realizada?'))await run('schedule.complete',{id,scope:'occurrence'},'Atividade concluída.');return;}
    if(kind==='goto-rooms'){onNavigate('salas');return;}
    if(kind==='goto-reports'){onNavigate('relatorios');return;}
    if(kind==='export'){const blob=new Blob([JSON.stringify(client.snapshot,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`potala-operacao-${today()}.json`;link.click();URL.revokeObjectURL(link.href);return;}
    if(kind==='schedule'){abrirEscolhaDeTipo(target.dataset.room?{room_id:target.dataset.room}:{});return;}
    open(kind,id,{room:target.dataset.room,destination:target.dataset.destination,asset:target.dataset.asset,item:target.dataset.item,offering:target.dataset.offering,schedule:target.dataset.schedule,entry:target.dataset.entry,date:filters.date,hour:target.dataset.hour});
  }

  function onChange(event){
    if(event.target.closest?.('[data-op-form]')){if(currentKind==='schedule')atualizarConflito();return;}
    const filter=event.target.dataset.opFilter;if(!filter)return;
    if(filter==='search')return;
    filters[filter]=event.target.value;
    if(filter==='date'&&!filters.date)filters.date=today();
    render();
  }
  function onInput(event){
    if(event.target.closest?.('[data-op-form]')){if(currentKind==='schedule')atualizarConflito();return;}
    if(event.target.dataset?.opFilter!=='search')return;
    clearTimeout(buscaEspera);const valor=event.target.value;
    buscaEspera=setTimeout(()=>{filters.search=valor;render();},180);
  }
  function onKeydown(event){
    if(menu&&!menu.hidden){
      if(event.key==='Escape'){event.preventDefault();fecharMenu({devolverFoco:true});return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&event.target.closest('[data-op-menu-painel]')){
        event.preventDefault();const itens=[...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];const atual=itens.indexOf(event.target);
        const proximo=event.key==='Home'?0:event.key==='End'?itens.length-1:(atual+(event.key==='ArrowDown'?1:-1)+itens.length)%itens.length;itens[proximo]?.focus();return;
      }
      if(event.key==='Tab')fecharMenu();
    }
    if(event.key==='Escape'&&detalheId&&!dialog.open){event.preventDefault();fecharDetalhes();}
  }

  const larguraMudou=()=>render();
  const mediaEstreita=consulta('(max-width: 819px)');
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);root.addEventListener('input',onInput);root.addEventListener('keydown',onKeydown);
  form.addEventListener('submit',onSubmit);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  mediaEstreita?.addEventListener?.('change',larguraMudou);
  render();
  return {render,filters,abrirDetalhes,fecharDetalhes,definirRecebidos(dados){recebidos=dados;render();},destroy(){root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);root.removeEventListener('input',onInput);root.removeEventListener('keydown',onKeydown);form.removeEventListener('submit',onSubmit);mediaEstreita?.removeEventListener?.('change',larguraMudou);clearTimeout(buscaEspera);}};
}
