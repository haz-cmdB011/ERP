-- Planeación pasa a ser una área más del enum (antes se modelaba como
-- area = null en perfiles). Va en su propia migración porque Postgres no
-- permite usar un valor de enum nuevo en la misma transacción que lo agrega.
alter type public.area_tipo add value 'planeacion';
