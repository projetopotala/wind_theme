import {randomBytes,timingSafeEqual} from 'node:crypto';

export function createOperationsApi({store}) {
 const token=randomBytes(32).toString('hex');
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 return async (req,res)=>{
  if(!req.url?.startsWith('/api/operations/'))return false;
  const host=req.headers.host||'';
  const origin=req.headers.origin;
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if(!loopback||!(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) || (origin&&origin!==`http://${host}`) || req.headers['sec-fetch-site']==='cross-site') {
   send(res,403,{error:'O painel local aceita apenas acesso desta máquina e desta origem.'});return true;
  }
  const route=req.url.split('?')[0];
  if(route==='/api/operations/session'&&req.method==='GET') {send(res,200,{mode:'local',actor:'local-admin',token});return true;}
  const supplied=Buffer.from(String(req.headers['x-potala-token']||''));const expected=Buffer.from(token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){send(res,403,{error:'Sessão local inválida. Reabra o painel.'});return true;}
  if(route==='/api/operations/state'&&req.method==='GET'){send(res,200,store.snapshot());return true;}
  if(route==='/api/operations/command'&&req.method==='POST') {
   if(!(req.headers['content-type']||'').startsWith('application/json')){send(res,415,{error:'Envie um comando JSON.'});return true;}
   try{
    let body='';for await(const chunk of req){body+=chunk.toString('utf8');if(Buffer.byteLength(body)>1_000_000){send(res,413,{error:'Operação muito grande.'});return true;}}
    send(res,200,store.command(JSON.parse(body)));
   }catch(error){send(res,error instanceof SyntaxError?400:409,{error:error.message||'Não foi possível salvar.'});}
   return true;
  }
  send(res,404,{error:'Operação não encontrada.'});return true;
 };
}
