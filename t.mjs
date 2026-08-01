import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base.xlsx'));
const ws=wb.getWorksheet('BASE');
ws.spliceRows(22,0,[],[]);
console.log(Object.keys(ws._merges||{}).join(','));
