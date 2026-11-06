\set ON_ERROR_STOP on

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into auth.users(id,email,email_confirmed_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin-slots@example.invalid',now());
insert into public.users(id,email,name,role,active)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin-slots@example.invalid','Admin Slots','admin',true);

alter table public.op_records disable trigger op_records_validate_before_write;
insert into public.op_records(collection,id,document) values
  ('rooms','test-room-a','{"status":"available","capacity":2,"opens_at":"00:00","closes_at":"23:59"}'),
  ('rooms','test-room-b','{"status":"available","capacity":2,"opens_at":"00:00","closes_at":"23:59"}'),
  ('rooms','test-room-c','{"status":"available","capacity":2,"opens_at":"00:00","closes_at":"23:59"}'),
  ('profiles','test-prof-a','{"active":true,"published":true,"roles":["professional"]}'),
  ('profiles','test-prof-b','{"active":true,"published":true,"roles":["professional"]}'),
  ('profiles','test-prof-c','{"active":true,"published":true,"roles":["professional"]}'),
  ('profiles','test-prof-d','{"active":true,"published":true,"roles":["professional"]}'),
  ('profiles','test-prof-e','{"active":true,"published":true,"roles":["professional"]}'),
  ('activity_offerings','test-offer-a','{"active":true,"mode":"presencial","professional_id":"test-prof-a"}'),
  ('activity_offerings','test-offer-b','{"active":true,"mode":"presencial","professional_id":"test-prof-b"}'),
  ('activity_offerings','test-offer-online','{"active":true,"mode":"online","professional_id":"test-prof-c"}'),
  ('activity_offerings','test-offer-d','{"active":true,"mode":"presencial","professional_id":"test-prof-d"}'),
  ('activity_offerings','test-offer-e','{"active":true,"mode":"presencial","professional_id":"test-prof-e"}');
alter table public.op_records enable trigger op_records_validate_before_write;
