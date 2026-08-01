import ExcelJS from 'exceljs'; import fs from 'fs';
for (const f of ['/mnt/user-uploads/TH-FR-10_Cuadro_de_Turnos_2026.xlsx','/tmp/th-fr-10-base.xlsx']) {
  try { const wb=new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(f)); console.log('OK',f,wb.worksheets.map(w=>w.name)); }
  catch(e){ console.log('FAIL',f,e.message); }
}
