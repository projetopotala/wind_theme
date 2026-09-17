// Local operational domain. Persistence, authorization and atomic rollback belong to the repository.
const DAY = 86400000;
const OFFSET = -3 * 3600000; // Institute local calendar: America/Sao_Paulo, modern dates.
const fail = message => { throw new Error(message); };
const required = (value, label) => String(value ?? '').trim() || fail(`${label} obrigatório.`);
const number = (value, label, min = 0) => Number.isSafeInteger(Number(value)) && Number(value) >= min ? Number(value) : fail(`${label} inválido.`);
function date(value) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!match || +match[2] < 1 || +match[2] > 12 || +match[3] < 1 || +match[3] > new Date(Date.UTC(+match[1], +match[2], 0)).getUTCDate() || +match[4] > 23 || +match[5] > 59) fail('Data ou horário inválido.');
  const result = new Date(match[6] ? text : `${text}-03:00`);
  if (!Number.isFinite(+result)) fail('Data inválida.');
  return +result;
}
const local = timestamp => new Date(timestamp + OFFSET);
const iso = timestamp => new Date(timestamp).toISOString();
const ref = (rows, id, label) => rows.find(row => row.id === id) || fail(`${label} não encontrado.`);
const clock = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0,2))*60+Number(value.slice(3)) : fail('Horário de funcionamento inválido.');
const bounds = item => [date(item.starts_at)-Number(item.setup_minutes || 0)*60000,date(item.ends_at)+Number(item.teardown_minutes || 0)*60000];
const overlaps = (a,b) => a[0]<b[1] && b[0]<a[1];
function upsert(rows, payload, ctx, normalize) {
  const old = payload.id ? ref(rows,payload.id,'Registro') : {};
  const row = normalize({...old,...payload,id:old.id || ctx.id(),created_at:old.created_at || ctx.now,updated_at:ctx.now});
  const index = rows.indexOf(old);
  if(index<0) rows.push(row); else rows[index]=row;
  return row;
}
function validateItem(state, item, others) {
  item.title=required(item.title,'Título');
  item.mode ||= 'presencial'; item.status ||= 'booked';
  if(!['presencial','online'].includes(item.mode)) fail('Modalidade inválida.');
  if(!['booked','completed','cancelled'].includes(item.status)) fail('Situação inválida.');
  const start=date(item.starts_at),end=date(item.ends_at);
  if(end<=start) fail('O fim deve ser posterior ao início.');
  item.starts_at=iso(start);item.ends_at=iso(end);
  item.participants=number(item.participants ?? 1,'Participantes',1);
  if((state.schedule_participants || []).filter(p=>p.schedule_id===item.id&&p.status!=='cancelled').length>item.participants)fail('Capacidade inferior aos participantes cadastrados.');
  item.setup_minutes=number(item.setup_minutes ?? 0,'Preparação');
  item.teardown_minutes=number(item.teardown_minutes ?? 0,'Desmontagem');
  if(item.price_cents!=null)item.price_cents=number(item.price_cents,'Preço');
  if(item.professional_id){ const p=ref(state.profiles,item.professional_id,'Profissional'); if(!p.roles?.some(r=>['professional','profissional'].includes(r)))fail('Pessoa não cadastrada como profissional.'); }
  if(item.client_id)ref(state.profiles,item.client_id,'Cliente');
  if(item.offering_id){const offering=ref(state.activity_offerings,item.offering_id,'Oferta');item.definition_id=offering.definition_id || item.definition_id || null;if(!item.professional_id&&offering.professional_id)item.professional_id=offering.professional_id;if(offering.capacity && item.participants>offering.capacity)fail('Capacidade da oferta excedida.');}
  if(item.online_url && !/^https?:\/\//i.test(item.online_url))fail('Link online deve usar HTTP ou HTTPS.');
  const range=bounds(item);
  if(item.mode==='online'){if(item.room_id)fail('Atendimento online não pode ter sala física.');item.room_id=null;}
  else {
    const room=ref(state.rooms,item.room_id,'Sala');
    if(item.status!=='cancelled'){
      if((state.maintenance_orders || []).some(order=>order.room_id===room.id&&order.status==='open'))fail('Sala em manutenção. Conclua a manutenção antes de reservar.');
      if(room.status!=='available'||!room.capacity)fail('Sala indisponível ou pendente de confirmação.');
      if(item.participants>room.capacity)fail('Capacidade da sala excedida.');
      const a=local(range[0]), b=local(range[1]);
      if(a.toISOString().slice(0,10)!==b.toISOString().slice(0,10)||a.getUTCHours()*60+a.getUTCMinutes()<clock(room.opens_at)||b.getUTCHours()*60+b.getUTCMinutes()>clock(room.closes_at))fail('Reserva fora do horário de funcionamento da sala.');
    }
  }
  item.requirements=(item.requirements || []).map(r=>{const item_id=required(r.item_id,'Item');ref(state.inventory_items || [],item_id,'Item de inventário');return {...r,item_id,quantity:number(r.quantity,'Quantidade',1)};});
  item.extras=(item.extras || []).map(e=>({...e,name:required(e.name,'Serviço extra'),quantity:number(e.quantity,'Quantidade',1),unit_price_cents:number(e.unit_price_cents,'Preço do extra')}));
  if(item.status==='cancelled')return item;
  // A mensagem diz o horário local ocupado, e não o carimbo ISO: "18:30 e 20:00" é o que a recepção precisa para escolher outro.
  const hm=value=>local(date(value)).toISOString().slice(11,16);
  for(const other of others){
    if(other.id===item.id||other.status==='cancelled'||!overlaps(range,bounds(other)))continue;
    if(item.room_id&&item.room_id===other.room_id){const nome=state.rooms.find(room=>room.id===item.room_id)?.name||'Sala';const feminino=/a$/i.test(nome.trim().split(" ")[0]);fail(`Conflito de sala: ${feminino?'a':'o'} ${nome} já está ${feminino?'ocupada':'ocupado'} entre ${hm(other.starts_at)} e ${hm(other.ends_at)} (“${other.title}”).`);}
    if(item.professional_id&&item.professional_id===other.professional_id)fail(`Conflito de profissional: ${state.profiles.find(person=>person.id===item.professional_id)?.display_name||'o profissional'} já tem “${other.title}” entre ${hm(other.starts_at)} e ${hm(other.ends_at)}.`);
  }
  return item;
}
function occurrences(item, rule) {
  if(!['daily','weekly','fortnightly','monthly','custom'].includes(rule.frequency))fail('Recorrência inválida.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(rule.until || ''))fail('Recorrência exige data final.');
  const start=date(item.starts_at), duration=date(item.ends_at)-start;
  const until=date(`${rule.until}T23:59:59-03:00`);
  if(until<start||until-start>DAY*730)fail('Recorrência deve terminar em até dois anos após o início.');
  const interval=number(rule.interval ?? 1,'Intervalo',1);
  const first=local(start), day=first.getUTCDate();
  if(rule.frequency==='monthly'&&day>28&&!['skip','last_day'].includes(rule.month_policy))fail('Recorrência mensal nos dias 29–31 exige escolher pular o mês ou usar o último dia.');
  const weekdays=rule.weekdays || [first.getUTCDay()];
  if(!Array.isArray(weekdays)||!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))fail('Dias da semana inválidos.');
  const times=[];
  for(let n=0;n<=731;n++){
    let t;
    if(rule.frequency==='monthly'){
      const d=new Date(+first);d.setUTCDate(1);d.setUTCMonth(first.getUTCMonth()+n*interval);
      const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
      if(day>max&&rule.month_policy==='skip')continue;
      d.setUTCDate(Math.min(day,max));t=+d-OFFSET;
    }else{
      const d=new Date(+first);d.setUTCDate(day+n);t=+d-OFFSET;
      if(t>until)break;
      const weeks=Math.floor(n/7), weekInterval=(rule.frequency==='fortnightly'?2:1)*interval;
      const accepted=rule.frequency==='daily'?n%interval===0:(rule.frequency==='custom'?n%interval===0:weeks%weekInterval===0&&weekdays.includes(d.getUTCDay()));
      if(!accepted)continue;
    }
    if(t>until)break;
    if(times.length>=366)fail('Recorrência excede 366 ocorrências. Reduza o período.');
    times.push({...item,starts_at:iso(t),ends_at:iso(t+duration),occurrence_key:iso(t)});
  }
  return times;
}
function saveSchedule(state,payload,ctx) {
  const old=payload.id?ref(state.schedule_items,payload.id,'Ocorrência'):null;
  if(old&&old.status!=='booked')fail('Ocorrência concluída ou cancelada preserva seu histórico.');
  const scope=payload.scope || 'occurrence';
  if(!['occurrence','future','series'].includes(scope))fail('Escopo inválido.');
  const {recurrence,...fields}=payload;
  delete fields.scope;
  let item={...old,...fields,id:old?.id || ctx.id(),origin:'instituto',status:old?.status || 'booked',created_at:old?.created_at || ctx.now,updated_at:ctx.now};
  if(item.status!=='booked')fail('Use os comandos de conclusão ou cancelamento.');
  let targets=[],series=null,replaced=[];
  if(old?.series_id&&scope!=='occurrence'){
    const original=ref(state.schedule_series,old.series_id,'Série');
    const deltaStart=payload.starts_at?date(payload.starts_at)-date(old.starts_at):0;
    const deltaEnd=payload.ends_at?date(payload.ends_at)-date(old.ends_at):deltaStart;
    if(recurrence&&scope!=='future')fail('Para alterar a regra de recorrência, escolha esta e próximas.');
    if(scope==='future')series={...original,id:ctx.id(),previous_series_id:original.id,starts_at:item.starts_at,created_at:ctx.now};
    targets=state.schedule_items.filter(row=>row.series_id===old.series_id&&row.status==='booked'&&!row.is_exception&&(scope==='series'||date(row.starts_at)>=date(old.starts_at))).map(row=>({...row,...fields,id:row.id,starts_at:iso(date(row.starts_at)+deltaStart),ends_at:iso(date(row.ends_at)+deltaEnd),series_id:series?.id || row.series_id,updated_at:ctx.now}));
    if(recurrence){
      replaced=targets.filter(row=>row.id!==old.id).map(row=>ref(state.schedule_items,row.id,'Ocorrência'));
      series.rule={...recurrence};series.until=recurrence.until;
      const exceptions=state.schedule_items.filter(row=>row.series_id===old.series_id&&(row.is_exception||row.status!=='booked'));
      targets=occurrences(item,recurrence).filter(row=>!exceptions.some(ex=>ex.id!==old.id&&ex.occurrence_key===row.occurrence_key)).map((row,i)=>({...row,id:i?ctx.id():old.id,series_id:series.id,is_exception:false}));
    }
  }else if(recurrence){
    if(old)fail('Crie uma nova série para adicionar recorrência.');
    series={id:ctx.id(),rule:{...recurrence},timezone:'America/Sao_Paulo',starts_at:item.starts_at,until:recurrence.until,created_at:ctx.now};
    targets=occurrences(item,recurrence).map((row,i)=>({...row,id:i?ctx.id():item.id,series_id:series.id}));
  }else targets=[{...item,...(old?.series_id?{is_exception:true}:{} )}];
  const ids=new Set(targets.map(row=>row.id));
  const others=state.schedule_items.filter(row=>!ids.has(row.id)&&!replaced.some(oldRow=>oldRow.id===row.id));
  const checked=[];
  for(const row of targets)checked.push(validateItem(state,row,[...others,...checked]));
  const finance=[];
  if(Array.isArray(state.financial_entries))for(const row of checked){
    const amount=(row.price_cents || 0)+(row.extras || []).reduce((sum,extra)=>sum+extra.quantity*extra.unit_price_cents,0);
    if(!amount)continue;
    const entry=state.financial_entries.find(value=>value.schedule_id===row.id&&value.source==='schedule'&&!value.reverses_entry_id);
    const paid=(state.payment_allocations || []).filter(value=>value.entry_id===entry?.id).reduce((sum,value)=>sum+value.amount_cents,0);
    if(entry&&paid&&entry.amount_cents!==amount)fail('O valor desta atividade já possui pagamento; ajuste pelo financeiro.');
    finance.push(entry?{entry,amount,row}:{entry:null,amount,row});
  }
  for(const row of replaced){row.status='cancelled';row.cancel_reason='Substituída por nova regra de recorrência';row.updated_at=ctx.now;}
  for(const row of checked){const index=state.schedule_items.findIndex(x=>x.id===row.id);if(index<0)state.schedule_items.push(row);else state.schedule_items[index]=row;}
  for(const change of finance){
    const due_date=local(date(change.row.starts_at)).toISOString().slice(0,10);
    if(change.entry)Object.assign(change.entry,{profile_id:change.row.client_id || null,description:change.row.title,amount_cents:change.amount,due_date,updated_at:ctx.now});
    else state.financial_entries.push({id:ctx.id(),source:'schedule',direction:'receivable',profile_id:change.row.client_id || null,schedule_id:change.row.id,description:change.row.title,category:'atividade',cost_center:'operacao',amount_cents:change.amount,due_date,created_at:ctx.now,updated_at:ctx.now});
  }
  if(series){state.schedule_series.push(series);if(series.previous_series_id)ref(state.schedule_series,series.previous_series_id,'Série').ends_before=old.starts_at;}
  return {id:item.id,ids:checked.map(row=>row.id),series_id:series?.id || old?.series_id || null};
}
export function applyScheduleCommand(state,command,ctx){
  const p=command.payload || {};
  switch(command.type){
    case 'setup.rooms': {
      if(state.rooms.length)return {count:state.rooms.length};
      for(let i=1;i<=10;i++)state.rooms.push({id:ctx.id(),code:`S${String(i).padStart(2,'0')}`,name:`Sala ${i}`,type:i<=6?'individual':'multiuso',status:'unconfirmed',capacity:null,accessible:null,created_at:ctx.now});
      return {count:10};
    }
    case 'room.save':return upsert(state.rooms,p,ctx,row=>{
      row.name=required(row.name,'Nome');row.code=required(row.code,'Código');row.status ||= 'unconfirmed';
      if(state.rooms.some(r=>r.id!==row.id&&r.code.toLowerCase()===row.code.toLowerCase()))fail('Código de sala já cadastrado.');
      if(!['available','unconfirmed','maintenance','unavailable'].includes(row.status))fail('Situação da sala inválida.');
      row.capacity=row.capacity==null||row.capacity===''?null:number(row.capacity,'Capacidade',1);
      if(row.status==='available'&&!row.capacity)fail('Confirme a capacidade antes de disponibilizar a sala.');
      if(row.status==='available'||row.opens_at||row.closes_at){if(clock(row.opens_at)>=clock(row.closes_at))fail('Funcionamento deve terminar após a abertura.');}
      if(row.hourly_rate_cents!=null)row.hourly_rate_cents=number(row.hourly_rate_cents,'Tarifa');
      for(const item of state.schedule_items.filter(x=>x.room_id===row.id&&x.status==='booked'))validateItem({...state,rooms:state.rooms.map(r=>r.id===row.id?row:r)},structuredClone(item),[]);
      return row;
    });
    case 'person.save':return upsert(state.profiles,p,ctx,row=>{
      row.display_name=required(row.display_name,'Nome');row.email=String(row.email || '').trim().toLowerCase();row.roles=[...new Set(row.roles || [])];
      if(row.roles.some(role=>!['client','student','participant','professional'].includes(role)))fail('Papel da pessoa inválido.');
      if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))fail('E-mail inválido.');
      if(row.email&&state.profiles.some(r=>r.id!==row.id&&r.email?.toLowerCase()===row.email))fail('E-mail já cadastrado para outra pessoa.');
      return row;
    });
    case 'definition.save':return upsert(state.activity_definitions,p,ctx,row=>({...row,title:required(row.title,'Título'),kind:required(row.kind,'Tipo')}));
    case 'offering.save':return upsert(state.activity_offerings,p,ctx,row=>{
      ref(state.activity_definitions,row.definition_id,'Definição');if(row.professional_id){const professional=ref(state.profiles,row.professional_id,'Profissional');if(!professional.roles?.includes('professional'))fail('Pessoa não cadastrada como profissional.');}
      if(row.capacity!=null&&state.enrollments.filter(e=>e.offering_id===row.id&&e.status!=='cancelled').length>number(row.capacity,'Capacidade',1))fail('Capacidade inferior às inscrições existentes.');
      return {...row,title:required(row.title,'Título'),capacity:row.capacity==null?null:number(row.capacity,'Capacidade',1)};
    });
    case 'enrollment.save':return upsert(state.enrollments,p,ctx,row=>{
      ref(state.profiles,row.profile_id,'Pessoa');const offering=ref(state.activity_offerings,row.offering_id,'Oferta');
      row.status ||= 'active';if(!['active','completed','cancelled','waitlist'].includes(row.status))fail('Situação da inscrição inválida.');
      if(state.enrollments.some(e=>e.id!==row.id&&e.profile_id===row.profile_id&&e.offering_id===row.offering_id))fail('Pessoa já possui inscrição nesta oferta; edite a inscrição existente.');
      const occupied=state.enrollments.filter(e=>e.id!==row.id&&e.offering_id===row.offering_id&&['active','completed'].includes(e.status)).length;
      if(['active','completed'].includes(row.status)&&offering.capacity!=null&&occupied>=offering.capacity)fail('Capacidade da oferta esgotada.');
      return row;
    });
    case 'participant.save':return upsert(state.schedule_participants,p,ctx,row=>{
      ref(state.profiles,row.profile_id,'Pessoa');const schedule=ref(state.schedule_items,row.schedule_id,'Ocorrência');
      row.role ||= 'participant';row.status ||= 'confirmed';
      if(!['confirmed','present','absent','cancelled'].includes(row.status))fail('Situação do participante inválida.');
      if(schedule.status==='cancelled')fail('Não é possível alterar participantes de ocorrência cancelada.');
      if(state.schedule_participants.some(e=>e.id!==row.id&&e.profile_id===row.profile_id&&e.schedule_id===row.schedule_id))fail('Participante já cadastrado nesta ocorrência.');
      const occupied=state.schedule_participants.filter(e=>e.id!==row.id&&e.schedule_id===row.schedule_id&&e.status!=='cancelled').length;
      if(row.status!=='cancelled'&&occupied>=schedule.participants)fail('Capacidade de participantes prevista para a ocorrência esgotada.');
      if(row.enrollment_id){const e=ref(state.enrollments,row.enrollment_id,'Inscrição');if(e.profile_id!==row.profile_id||e.offering_id!==schedule.offering_id)fail('Inscrição incompatível com participante ou oferta.');}
      return row;
    });
    case 'schedule.save':return saveSchedule(state,p,ctx);
    case 'schedule.cancel':case 'schedule.complete': {
      const item=ref(state.schedule_items,p.id,'Ocorrência');
      if(item.status!=='booked')fail('Ocorrência já concluída ou cancelada.');
      const cancel=command.type==='schedule.cancel',scope=p.scope || 'occurrence';
      if(!['occurrence','future','series'].includes(scope))fail('Escopo inválido.');
      const reason=cancel?required(p.reason,'Motivo do cancelamento'):null;
      const targets=cancel&&item.series_id&&scope!=='occurrence'?state.schedule_items.filter(row=>row.series_id===item.series_id&&row.status==='booked'&&(scope==='series'||date(row.starts_at)>=date(item.starts_at))):[item];
      const entries=cancel&&Array.isArray(state.financial_entries)?state.financial_entries.filter(entry=>targets.some(row=>row.id===entry.schedule_id)&&entry.source==='schedule'&&!entry.reverses_entry_id&&!state.financial_entries.some(reversal=>reversal.reverses_entry_id===entry.id)):[];
      if(entries.length){
        if(!['retain','reverse_unpaid'].includes(p.financial_action))fail('Escolha o tratamento financeiro do cancelamento.');
        if(p.financial_action==='reverse_unpaid'){
          for(const entry of entries)if((state.payment_allocations || []).some(allocation=>allocation.entry_id===entry.id&&allocation.amount_cents))fail('Há pagamento registrado; faça o estorno pelo Financeiro antes de cancelar.');
          for(const entry of entries)state.financial_entries.push({id:ctx.id(),direction:entry.direction,amount_cents:entry.amount_cents,description:`Cancelamento: ${entry.description}`,due_date:ctx.now.slice(0,10),reverses_entry_id:entry.id,schedule_id:entry.schedule_id,created_at:ctx.now});
        }
      }
      for(const row of targets){row.status=cancel?'cancelled':'completed';row.updated_at=ctx.now;if(cancel)row.cancel_reason=reason;else row.completed_at=ctx.now;}
      return item;
    }
    default:return undefined;
  }
}
function unionMinutes(intervals){
  const sorted=intervals.filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;
  for(const [a,b]of sorted){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total/60000;
}
export function occupancy(state,{from,to}){
  const start=date(from),end=date(to);if(end<=start||end-start>DAY*732)fail('Período de ocupação inválido.');
  return state.rooms.map(room=>{
    const windows=[];
    if(room.status==='available'&&room.opens_at&&room.closes_at){const d=local(start);d.setUTCHours(0,0,0,0);for(let t=+d-OFFSET;t<end;t+=DAY)windows.push([Math.max(start,t+clock(room.opens_at)*60000),Math.min(end,t+clock(room.closes_at)*60000)]);}
    const items=state.schedule_items.filter(i=>i.room_id===room.id&&i.mode!=='online'&&i.status!=='cancelled');
    const isBlock=i=>['maintenance','block','bloqueio','manutencao'].includes(i.kind);
    const clip=list=>list.flatMap(i=>windows.map(w=>{const b=bounds(i);return [Math.max(w[0],b[0]),Math.min(w[1],b[1])];}));
    const maintenance=(state.maintenance_orders || []).filter(order=>order.room_id===room.id).flatMap(order=>{
      const a=Math.max(start,date(order.created_at || from)),b=Math.min(end,order.completed_at?date(order.completed_at):end);
      return windows.map(window=>[Math.max(window[0],a),Math.min(window[1],b)]);
    });
    const blocked=unionMinutes([...clip(items.filter(isBlock)),...maintenance]);
    const available=Math.max(0,unionMinutes(windows)-blocked),reserved=unionMinutes(clip(items.filter(i=>!isBlock(i))));
    return {room_id:room.id,available_minutes:available,blocked_minutes:blocked,reserved_minutes:reserved,completed_minutes:unionMinutes(clip(items.filter(i=>i.status==='completed'&&!isBlock(i)))),idle_minutes:Math.max(0,available-reserved),rate:available?reserved/available:null};
  });
}
