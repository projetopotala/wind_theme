-- Executado como primeiro arquivo de cada sessão que poderá escrever.
do $$
begin
  if inet_server_addr() is distinct from '127.0.0.1'::inet
     or inet_server_port() is distinct from 55432
     or current_database() <> 'potala_appointments_f224'
     or current_user <> 'potala_lab_admin'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or lower(replace(current_setting('data_directory'), chr(92), '/'))
        <> lower('C:/Users/vicel/AppData/Local/PotalaPgLabs/pg17-homolog-20261013/data') then
    raise exception 'Destino F2.2.4 não autorizado';
  end if;
end;
$$;
