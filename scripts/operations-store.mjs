import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const collections = Object.freeze([
  'rooms','profiles','activity_definitions','activity_offerings','offering_professionals',
  'schedule_items','schedule_series','schedule_participants','enrollments',
  'inventory_items','inventory_assets','inventory_balances','inventory_movements','maintenance_orders',
  'financial_entries','payments','payment_allocations','split_rules','split_allocations','audit_events',
]);

/** Local-only adapter. Each domain collection has one source; SQLite owns atomicity.
 * Documents preserve domain fields without coupling frontend code to a storage driver.
 * The local database is never a fallback for a failed remote write.
 */
export function createOperationalStore({path,handlers=[]}) {
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(`CREATE TABLE IF NOT EXISTS operation_meta (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO operation_meta VALUES(1,0);
    CREATE TABLE IF NOT EXISTS operation_requests (id TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);`);
  for(const table of collections) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document)));`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS rooms_code ON rooms(json_extract(document,'$.code'));
    CREATE INDEX IF NOT EXISTS schedule_room_start ON schedule_items(json_extract(document,'$.room_id'),json_extract(document,'$.starts_at'));
    CREATE INDEX IF NOT EXISTS finance_due ON financial_entries(json_extract(document,'$.due_date'));
    CREATE UNIQUE INDEX IF NOT EXISTS asset_code ON inventory_assets(json_extract(document,'$.asset_code'));`);
  const snapshot=()=>Object.assign({revision:db.prepare('SELECT revision FROM operation_meta WHERE id=1').get().revision},
    Object.fromEntries(collections.map(table=>[table,db.prepare(`SELECT document FROM ${table} ORDER BY rowid`).all().map(row=>JSON.parse(row.document))])));
  function command(command) {
    if(!command || typeof command.type!=='string' || !command.payload || typeof command.payload!=='object' || Array.isArray(command.payload)) throw new Error('Comando inválido.');
    const key=command.idempotency_key;
    if(typeof key!=='string'||key.length<3||key.length>160) throw new Error('Identificador da operação inválido.');
    const actor=String(command.actor||'local-admin').trim().slice(0,120)||'local-admin';
    const digest=createHash('sha256').update(JSON.stringify({type:command.type,payload:command.payload,actor})).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous=db.prepare('SELECT digest,result FROM operation_requests WHERE id=?').get(key);
      if(previous) {
        if(previous.digest!==digest) throw new Error('Identificador reutilizado para outra operação.');
        db.exec('COMMIT'); return JSON.parse(previous.result);
      }
      const before=snapshot();
      if(command.revision!==before.revision) throw new Error('Os dados foram atualizados em outra janela. Atualize e tente novamente.');
      const state=structuredClone(before);
      const ctx={id:randomUUID,now:new Date().toISOString(),actor};
      let result;
      for(const handler of handlers) {result=handler(state,command,ctx);if(result!==undefined)break;}
      if(result===undefined) throw new Error('Operação desconhecida.');
      const changes=[];
      for(const table of collections.filter(name=>name!=='audit_events')) {
        const old=new Map(before[table].map(row=>[row.id,JSON.stringify(row)]));
        const seen=new Set();
        for(const row of state[table]) {
          row.id ||= randomUUID();
          if(seen.has(row.id)) throw new Error('Identificador duplicado.');
          seen.add(row.id);
          const after=JSON.stringify(row); const prior=old.get(row.id);
          if(prior!==after) {
            db.prepare(`INSERT INTO ${table}(id,document) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document`).run(row.id,after);
            changes.push({table,id:row.id,before:prior?JSON.parse(prior):null,after:row});
          }
        }
        for(const [id,prior] of old) if(!seen.has(id)) {db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);changes.push({table,id,before:JSON.parse(prior),after:null});}
      }
      const audit={id:randomUUID(),actor:ctx.actor,at:ctx.now,action:command.type,reason:command.payload.reason||'',changes};
      db.prepare('INSERT INTO audit_events VALUES(?,?)').run(audit.id,JSON.stringify(audit));
      const response={result,revision:before.revision+1};
      db.prepare('UPDATE operation_meta SET revision=? WHERE id=1').run(response.revision);
      db.prepare('INSERT INTO operation_requests VALUES(?,?,?)').run(key,digest,JSON.stringify(response));
      db.exec('COMMIT');return response;
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }
  return {snapshot,command,close:()=>db.close()};
}
