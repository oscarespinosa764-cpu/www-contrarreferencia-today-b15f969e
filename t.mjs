import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook();
await wb.xlsx.load(fs.readFileSync('/mnt/user-uploads/TH-FR-10_Cuadro_de_Turnos_2026.xlsx'));
for (const w of [...wb.worksheets]) if (!['AGO','control de cambios'].includes(w.name)) wb.removeWorksheet(w.id);
const ws=wb.getWorksheet('AGO'); ws.name='BASE';
const clear=(a)=>{ const c=ws.getCell(a); c.value=null; };
['C6','C8','Q34','Q35','M38','AH34','B44','B45'].forEach(clear);
// desmerge bloques nombre
for(let r=12;r<=20;r+=2){ try{ws.unMergeCells(`B${r}:F${r+1}`);}catch(e){console.log('um',r,e.message);} ws.mergeCells(`B${r}:F${r}`); ws.mergeCells(`B${r+1}:F${r+1}`); }
for(let r=12;r<=21;r++){
  if(r%2===0) ws.getCell(`B${r}`).value=null;
  for(let c=10;c<=40;c++) ws.getRow(r).getCell(c).value=null;
}
for(let r=12;r<=20;r+=2){
  ws.getCell(`AO${r}`).value={formula:`SUM(J${r+1}:AN${r+1})`};
  ws.getCell(`AP${r}`).value={formula:`AO${r}-176`};
  ws.getCell(`AQ${r}`).value=0;
  ws.getCell(`AR${r}`).value={formula:`AP${r}+AQ${r}`};
}
for(let r=24;r<=31;r++) for(let c=2;c<=4;c++) ws.getRow(r).getCell(c).value=null;
for(let r=25;r<=30;r++) for(let c=6;c<=10;c++) ws.getRow(r).getCell(c).value=null;
ws.pageSetup.orientation='landscape'; ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1; ws.pageSetup.fitToHeight=0; ws.pageSetup.printArea='A1:AR45';
const buf=Buffer.from(await wb.xlsx.writeBuffer());
fs.writeFileSync('/tmp/base.xlsx',buf);
fs.writeFileSync('/tmp/base64.txt',buf.toString('base64'));
console.log('bytes',buf.length);
const wb2=new ExcelJS.Workbook(); await wb2.xlsx.load(fs.readFileSync('/tmp/base.xlsx'));
console.log('reload ok',wb2.worksheets.map(w=>w.name));
const s=wb2.getWorksheet('BASE');
let pii=[];
s.eachRow({includeEmpty:false},(row,i)=>{row.eachCell({includeEmpty:false},(c)=>{const v=typeof c.value==='string'?c.value:'';if(/OSCAR|NAYIBET|EDNA|LUISA|WENDY|GLORIA|VACACION/i.test(v))pii.push([c.address,v]);});});
console.log('PII',pii);
console.log('merges sample', Object.keys(s._merges||{}).length);
