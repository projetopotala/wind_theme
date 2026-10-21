-- Apenas identidades e contatos fictícios no banco novo.
begin;
insert into auth.users(id,email) values
 ('20000000-0000-4000-8000-000000000001','admin@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','inativo@example.invalid'),
 ('20000000-0000-4000-8000-000000000003','comum@example.invalid');
insert into public.users(id,email,name,role,active) values
 ('20000000-0000-4000-8000-000000000001','admin@example.invalid','Admin Fictício','admin',true),
 ('20000000-0000-4000-8000-000000000002','inativo@example.invalid','Admin Inativo','admin',false);
-- O administrador local exercita a lógica da RPC; anon permanece sem EXECUTE.
select public.submit_appointment_request(
 '30000000-0000-4000-8000-000000000001','Reiki','presencial','Pessoa Fictícia',
 'email','pedido@example.invalid',(now() at time zone 'America/Sao_Paulo')::date + 1,'tarde');
commit;
