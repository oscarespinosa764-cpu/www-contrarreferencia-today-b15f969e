import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base20.xlsx'));
const ws=wb.getWorksheet('BASE');
const seen=new Set();
for(let r=1;r<=80;r++){ const out=[]; ws.getRow(r).eachCell({includeEmpty:false},c=>{ const v=c.value; if(v===null||v==='')return; const k=r+'|'+JSON.stringify(v); if(seen.has(k))return; seen.add(k); out.push(c.address+'='+JSON.stringify(v).slice(0,45)); }); if(out.length) console.log(r, out.slice(0,8).join(' | ')); }
console.log('cols', [8,9,10,11,36,37,38,39,40,41,42,43,44].map(i=>i+':'+(ws.getColumn(i).width)).join(' '));
