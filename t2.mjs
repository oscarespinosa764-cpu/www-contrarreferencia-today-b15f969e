import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base.xlsx'));
const ws=wb.getWorksheet('BASE');
const m=ws._merges['B12'];
console.log(Object.keys(m), m.top,m.bottom,m.tl,m.br, m.range);
