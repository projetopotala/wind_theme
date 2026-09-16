const clone=value=>value==null?value:structuredClone(value);
const stable=value=>value&&typeof value==='object'&&!Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))
  : Array.isArray(value)?value.map(stable):value;
const signature=(type,payload)=>JSON.stringify(stable({type,payload}));
const uuid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createOperationsClient({token,fetchImpl=globalThis.fetch,base='/api/operations'}={}) {
  if(!String(token||'').trim())throw new TypeError('Token da operação local é obrigatório.');
  if(typeof fetchImpl!=='function')throw new TypeError('fetch indisponível.');
  let state=null,queue=Promise.resolve(),retry=null,actor='local-admin';
  const headers={'X-Potala-Token':token};
  async function body(response){const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível acessar a operação local.'),{status:response.status});return data;}
  async function refresh(){const data=await body(await fetchImpl(`${base}/state`,{method:'GET',headers}));state=clone(data);return clone(state);}
  async function execute(type,payload){
    if(!state)await refresh();
    const mark=signature(type,payload);const key=retry?.signature===mark?retry.key:uuid();retry={signature:mark,key};
    const response=await fetchImpl(`${base}/command`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({type,payload,revision:state.revision,idempotency_key:key,actor})});
    if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===409)await refresh().catch(()=>{});throw new Error(data.error||'Não foi possível salvar.');}
    const saved=await response.json();
    await refresh();
    retry=null;return clone(saved.result);
  }
  function command(type,payload={}){const task=queue.then(()=>execute(type,clone(payload)));queue=task.catch(()=>{});return task;}
  return {get snapshot(){return clone(state);},refresh,command,setActor(value){actor=String(value||'local-admin').trim().slice(0,120)||'local-admin';}};
}
