import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const DIR = new URL("../../supabase/migrations/", import.meta.url);
const U = { OWNER: "00000000-0000-0000-0000-0000000000f1", CLIENT: "00000000-0000-0000-0000-0000000000a1", OTHER: "00000000-0000-0000-0000-0000000000b1" };
const OFFER = "pay11-oferta"; const PROF = "pay11-prof";
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create schema extensions; create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),deleted_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
alter table storage.objects enable row level security; create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
for (const file of readdirSync(DIR).sort()) await db.exec(readFileSync(new URL(file, DIR), "utf8"));
await db.exec("grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role");
for (const id of Object.values(U)) await db.query("insert into auth.users(id,email) values($1,$2)",[id,`${id.slice(-2)}@pay11.test`]);
await db.query("insert into public.users(id,role,name,email,active) values($1,'owner','Owner','owner@pay11.test',true)",[U.OWNER]);
after(async()=>db.close());
async function as(uid,sql,p=[],role="authenticated"){await db.exec("savepoint q");try{await db.exec(`set local role ${role}`);await db.query("select set_config('test.uid',$1,true)",[uid]);const r=await db.query(sql,p);await db.exec("reset role; release savepoint q");return{ok:true,rows:r.rows};}catch(e){await db.exec("rollback to savepoint q; reset role");return{ok:false,code:e.code,message:String(e.message)};}}
async function tx(fn){await db.exec("begin");try{return await fn();}finally{await db.exec("rollback");}}
async function seed(){
 await db.query("insert into public.op_records(collection,id,document) values('profiles',$1,jsonb_build_object('display_name','Profissional','active',true,'published',true,'roles',jsonb_build_array('professional')))",[PROF]);
 await db.query("insert into public.op_records(collection,id,document) values('activity_offerings',$1::text,jsonb_build_object('title','Atendimento','active',true,'published',true,'professional_id',$2::text))",[OFFER,PROF]);
 await db.query("insert into public.appointment_service_prices(offering_id,amount_cents,active) values($1,15000,true)",[OFFER]);
 const req=(await db.query("insert into public.appointment_requests(idempotency_key,service,modality,requester_name,contact_type,contact,preferred_date,preferred_period,requester_user_id,offering_id) values(gen_random_uuid(),'Atendimento','online','Cliente','email','x@y.test',current_date+3,'tarde',$1,$2) returning id",[U.CLIENT,OFFER])).rows[0].id;
 const slot=(await db.query("insert into public.appointment_slots(offering_id,professional_profile_id,starts_at,ends_at,status,held_by_request_id,created_by) values($1,$2,now()+interval '3 days',now()+interval '3 days 1 hour','held',$3,$4) returning id",[OFFER,PROF,req,U.OWNER])).rows[0].id;
 await db.query("update public.appointment_requests set appointment_slot_id=$1 where id=$2",[slot,req]); return{req,slot};
}

test("politica nasce vazia e somente Owner habilita oferta com preco",()=>tx(async()=>{
 const {req}=await seed();
 assert.equal((await db.query("select count(*)::int n from public.pay_offering_policies")).rows[0].n,0);
 assert.equal((await as(U.CLIENT,"select public.admin_set_pay_offering_policy($1,true,true)",[OFFER])).code,"42501");
 assert.equal((await as(U.OWNER,"select public.admin_set_pay_offering_policy($1,true,true)",[OFFER])).ok,true);
 assert.equal((await as(U.CLIENT,"select public.pay_my_appointment_payment_options() v")).rows[0].v[0].amount_cents,15000);
 assert.equal((await as(U.CLIENT,"select public.pay_my_appointment_payment_options() v")).rows[0].v[0].charge_allowed,false);
 assert.equal((await as(U.OTHER,"select public.pay_my_appointment_payment_options() v")).rows[0].v.length,0);
 assert.equal((await as(U.CLIENT,"select public.pay_charge_allowed($1,$2)",[U.CLIENT,req],"service_role")).rows[0].pay_charge_allowed,false);
}));

test("trava global AND politica: outro cliente/pedido e consulta confirmada nunca passam",()=>tx(async()=>{
 const {req}=await seed(); await as(U.OWNER,"select public.admin_set_pay_offering_policy($1,true,true)",[OFFER]);
 await db.exec("update public.pay_runtime_settings set charges_enabled=true");
 assert.equal((await as(U.CLIENT,"select public.pay_charge_allowed($1,$2) v",[U.CLIENT,req],"service_role")).rows[0].v,true);
 assert.equal((await as(U.OTHER,"select public.pay_charge_allowed($1,$2) v",[U.OTHER,req],"service_role")).rows[0].v,false);
 await db.exec("set session_replication_role=replica");
 await db.query("insert into public.op_records(collection,id,document) values('schedule_items','pay11-agenda',jsonb_build_object('id','pay11-agenda','title','Atendimento','kind','appointment','status','booked'))");
 await db.exec("set session_replication_role=origin");
 await db.query("update public.appointment_requests set reservation_schedule_id='pay11-agenda',status='encerrada' where id=$1",[req]);
 assert.equal((await as(U.CLIENT,"select public.pay_charge_allowed($1,$2) v",[U.CLIENT,req],"service_role")).rows[0].v,false);
 const option=(await as(U.CLIENT,"select public.pay_my_appointment_payment_options() v")).rows[0].v[0];
 assert.equal(option.confirmed,true); assert.equal(option.charge_allowed,false); assert.match(option.reason,/confirmado/i);
}));

test("desativar oferta bloqueia novas cobrancas e registra auditoria sem tocar pagamentos",()=>tx(async()=>{
 await seed(); await as(U.OWNER,"select public.admin_set_pay_offering_policy($1,true,true)",[OFFER]);
 await as(U.OWNER,"select public.admin_set_pay_offering_policy($1,false,true)",[OFFER]);
 assert.equal((await db.query("select enabled from public.pay_offering_policies where offering_id=$1",[OFFER])).rows[0].enabled,false);
 assert.equal((await db.query("select count(*)::int n from public.appointment_payments")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from public.op_records where collection='audit_events' and document->>'action' like 'pay_offering.%'")).rows[0].n,2);
}));
