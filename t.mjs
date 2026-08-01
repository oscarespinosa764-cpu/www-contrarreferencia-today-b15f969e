import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base.xlsx'));
const ws=wb.getWorksheet('BASE');
// insertar 2 filas antes de la 22 (tras el ultimo bloque)
ws.spliceRows(22,0,[],[]);
const copyRow=(src,dst)=>{ const s=ws.getRow(src), d=ws.getRow(dst); d.height=s.height;
  for(let c=1;c<=44;c++){ d.getCell(c).style={...s.getCell(c).style}; } };
copyRow(20,22); copyRow(21,23);
ws.mergeCells('B22:F22'); ws.mergeCells('B23:F23'); ws.mergeCells('G22:I22'); ws.mergeCells('G23:I23');
['AO','AP','AQ','AR'].forEach(col=>ws.mergeCells(`${col}22:${col}23`));
ws.getCell('B22').value='NUEVO COLABORADOR'; ws.getCell('B23').value='Cargo: X · Sede: Y';
ws.getCell('G22').value='Turno'; ws.getCell('G23').value='Numero de Horas';
const buf=Buffer.from(await wb.xlsx.writeBuffer());
const wb2=new ExcelJS.Workbook(); await wb2.xlsx.load(buf); const s=wb2.getWorksheet('BASE');
console.log('B25',s.getCell('B25').value,'F25',s.getCell('F25').value,'M39',s.getCell('M39').value,'B22',s.getCell('B22').value);
console.log('style B22 fill', JSON.stringify(s.getCell('B22').style.border||{}).slice(0,120));
fs.writeFileSync('/tmp/spl.xlsx',buf);
