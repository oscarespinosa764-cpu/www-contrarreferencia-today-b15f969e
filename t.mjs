import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base.xlsx'));
const ws=wb.getWorksheet('BASE');
ws.getCell('B20').value='ULT'; ws.getCell('G20').value='Turno'; ws.getCell('G21').value='Numero de Horas';
ws.duplicateRow(20,2,true);
for(let r=18;r<=28;r++) console.log(r, JSON.stringify([ws.getCell(`B${r}`).value, ws.getCell(`G${r}`).value, ws.getCell(`AO${r}`).value]));
console.log(Object.keys(ws._merges||{}).filter(k=>/^(B|G|AO)/.test(k)).join(','));
