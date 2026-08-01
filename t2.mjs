import ExcelJS from 'exceljs'; import fs from 'fs';
const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync('/tmp/base20.xlsx'));
const ws=wb.getWorksheet('BASE');
for(let r=48;r<=78;r++){ const v=[]; ws.getRow(r).eachCell({includeEmpty:false},c=>{if(c.value!==null&&c.value!=='')v.push(c.address+'='+JSON.stringify(c.value).slice(0,40));}); if(v.length)console.log(r,v.join(' | ').slice(0,220)); }
