import * as XLSX from 'xlsx'; import fs from 'fs';
const wb=XLSX.read(fs.readFileSync('/tmp/qa.xlsx'),{type:'buffer'});
const ws=wb.Sheets[wb.SheetNames[0]];
const aoa=XLSX.utils.sheet_to_json<any[]>(ws,{header:1,blankrows:false,defval:''});
let h=-1; for(let i=0;i<aoa.length;i++){const r=aoa[i].map((c:any)=>String(c??'').trim().toLowerCase()); if(r.includes('nombres y apellidos')){h=i;break;}}
console.log('headerIdx',h,'nameCol',aoa[h].findIndex((c:any)=>String(c).toLowerCase().trim()==='nombres y apellidos'));
const dayCols=aoa[h].map((c:any,i:number)=>[i,parseInt(String(c),10)]).filter(([,n]:any)=>n>=1&&n<=31);
console.log('dias',dayCols.length);
for(let i=h+1;i<h+8;i++) console.log(i, JSON.stringify(aoa[i]?.slice(0,12)));
