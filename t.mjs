import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base.xlsx'));
const ws=wb.getWorksheet('BASE');
const COLS=44;
const snap=(r)=>{const row=ws.getRow(r);const st=[];for(let c=1;c<=COLS;c++)st.push(JSON.parse(JSON.stringify(row.getCell(c).style||{})));return {st,h:row.height};};
const T=snap(20), H=snap(21);
const BLOCKS=20, EXTRA=(BLOCKS-5)*2;
ws.duplicateRow(21, EXTRA, true);
// normalizar bloques 12..(11+2*BLOCKS)
const last=11+2*BLOCKS;
for(let r=12;r<=last;r++){
  const tpl = (r-12)%2===0 ? T : H;
  const row=ws.getRow(r); row.height=tpl.h;
  for(let c=1;c<=COLS;c++){ const cell=row.getCell(c); cell.style=JSON.parse(JSON.stringify(tpl.st[c-1])); }
}
// limpiar merges de la zona y rehacerlos
for(const key of [...new Set(Object.values(ws._merges||{}).map(m=>m.range))]){
  const m=Object.values(ws._merges).find(x=>x.range===key);
  if(m.top>=12 && m.bottom<=last){ try{ws.unMergeCells(key);}catch(e){console.log('unm',key,e.message);} }
}
for(let i=0;i<BLOCKS;i++){
  const r=12+i*2;
  ws.mergeCells(`B${r}:F${r}`); ws.mergeCells(`B${r+1}:F${r+1}`);
  ws.mergeCells(`G${r}:I${r}`); ws.mergeCells(`G${r+1}:I${r+1}`);
  for(const col of ['AO','AP','AQ','AR']) ws.mergeCells(`${col}${r}:${col}${r+1}`);
  ws.getCell(`B${r}`).value=null; ws.getCell(`B${r+1}`).value=null;
  ws.getCell(`G${r}`).value='Turno'; ws.getCell(`G${r+1}`).value='Numero de Horas';
  for(let c=10;c<=40;c++){ ws.getRow(r).getCell(c).value=null; ws.getRow(r+1).getCell(c).value=null; }
  ws.getCell(`AO${r}`).value={formula:`SUM(J${r+1}:AN${r+1})`};
  ws.getCell(`AP${r}`).value={formula:`AO${r}-176`};
  ws.getCell(`AQ${r}`).value=0;
  ws.getCell(`AR${r}`).value={formula:`AP${r}+AQ${r}`};
}
ws.pageSetup.printArea=`A1:AR${last+35}`;
const buf=Buffer.from(await wb.xlsx.writeBuffer());
fs.writeFileSync('/tmp/base20.xlsx',buf);
fs.writeFileSync('/tmp/base20.b64',buf.toString('base64'));
const wb2=new ExcelJS.Workbook(); await wb2.xlsx.load(buf); const s=wb2.getWorksheet('BASE');
for(const a of ['B51','G51','B52','F52','H52','M52','M62','AD62','B72']) console.log(a, JSON.stringify(s.getCell(a).value));
console.log('bytes',buf.length,'rows',s.rowCount);
