## Uso
1. `npm install`
2. Crear archivo `.env` basado en el `.env-example`
3. Iniciar sesion en el timetracker.
4. Entrar en el timetracker o beanstalk y copiar el hash del ultimo commit reportado.
5. Colocar el hash en el `.env` `LAST_REPORTED_COMMIT`
6. `npm start`
7. Colocar el dia o dias a reportar
8. Colocar el mes a reportar

### Advertencia
Al final hay que revisar en el timetracker si se guardaron los dias reportados, porque el timetracker responde con `status 200` y `statusText OK` aun si no se guarda nada y no retorna error. 

El script guarda el ultimo commit reportado en el `.env` `LAST_REPORTED_COMMIT`, si dio error la operacion hay que colocar el ultimo commit reportado correcto.
