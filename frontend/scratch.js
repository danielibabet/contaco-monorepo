const fs = require('fs');
const path = require('path');

const modules = ['asientos', 'diario', 'subcuentas', 'mayor', 'conciliacion', 'balances', 'situacion', 'pyg', 'modelos', 'facturas', 'activos', 'cierre', 'empresas'];

modules.forEach(mod => {
  const filePath = path.join(__dirname, 'src', 'app', mod, 'page.tsx');
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find 'return (' and the next '<div className="'
    const returnIndex = content.lastIndexOf('return (');
    if (returnIndex !== -1) {
      const classIndex = content.indexOf('className="', returnIndex);
      if (classIndex !== -1) {
        content = content.slice(0, classIndex + 11) + 'tour-step-1 ' + content.slice(classIndex + 11);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${mod}`);
      } else {
        console.log(`No className found after return in ${mod}`);
      }
    } else {
      console.log(`No return found in ${mod}`);
    }
  } else {
    console.log(`File not found: ${mod}`);
  }
});
