import fs from 'fs';
import { construirCuadroTHFR10 } from './src/lib/cuadro-plantilla';
const nombres=[['LAURA GOMEZ','Auxiliar de Referencia','SEDE NORTE'],['CARLOS RUIZ','Auxiliar de Referencia','SEDE CENTRO'],['ANA TORRES','Coordinadora','SEDE NORTE'],['JOSE PEREZ','Auxiliar','SEDE SUR'],['MARIA LOPEZ','Auxiliar','SEDE NORTE'],['PEDRO DIAZ','Auxiliar','SEDE SUR'],['SARA MEJIA','Auxiliar','SEDE CENTRO']];
const DOW=['D','L','M','X','J','V','S'];
const filas=nombres.map(([n,c,s],i)=>{const turnos:any={};for(let d=1;d<=30;d++){ if((d+i)%7===0) continue; turnos[d]={code:['M','T','N','A'][(d+i)%4],hours:8};} return {nombre:n,cargo:c,sede:s,turnos};});
const b64=await construirCuadroTHFR10({anio:2026,mes:9,nombreMes:'Septiembre',letraDia:(d)=>DOW[new Date(2026,8,d).getDay()],baseHoras:176,responsable:'ANA TORRES',elaboradoNombre:'ANA TORRES',elaboradoCargo:'Coordinadora',filas,convenciones:[{code:'M',name:'Mañana',inicio:'06:00',fin:'14:00',horas:8},{code:'T',name:'Tarde',inicio:'14:00',fin:'22:00',horas:8},{code:'N',name:'Noche',inicio:'22:00',fin:'06:00',horas:8},{code:'A',name:'Administrativo',inicio:'07:00',fin:'17:00',horas:10}]});
fs.writeFileSync('/tmp/qa.xlsx',Buffer.from(b64,'base64'));
console.log('ok');
