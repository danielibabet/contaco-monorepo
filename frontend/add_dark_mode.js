const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;

            const replacements = [
                { match: /\bbg-white(?![\w-]| dark:bg-)/g, replace: 'bg-white dark:bg-slate-900' },
                { match: /\bbg-slate-50(?![\w-]| dark:bg-)/g, replace: 'bg-slate-50 dark:bg-slate-800' },
                { match: /\bbg-gray-50(?![\w-]| dark:bg-)/g, replace: 'bg-gray-50 dark:bg-slate-800' },
                { match: /\btext-slate-800(?![\w-]| dark:text-)/g, replace: 'text-slate-800 dark:text-slate-200' },
                { match: /\btext-slate-700(?![\w-]| dark:text-)/g, replace: 'text-slate-700 dark:text-slate-300' },
                { match: /\btext-slate-600(?![\w-]| dark:text-)/g, replace: 'text-slate-600 dark:text-slate-400' },
                { match: /\btext-gray-800(?![\w-]| dark:text-)/g, replace: 'text-gray-800 dark:text-gray-200' },
                { match: /\btext-gray-900(?![\w-]| dark:text-)/g, replace: 'text-gray-900 dark:text-gray-100' },
                { match: /\btext-gray-600(?![\w-]| dark:text-)/g, replace: 'text-gray-600 dark:text-gray-400' },
                { match: /\bborder-slate-200(?![\w-]| dark:border-)/g, replace: 'border-slate-200 dark:border-slate-700' },
                { match: /\bborder-slate-300(?![\w-]| dark:border-)/g, replace: 'border-slate-300 dark:border-slate-600' },
                { match: /\bborder-gray-200(?![\w-]| dark:border-)/g, replace: 'border-gray-200 dark:border-gray-700' },
                { match: /\bborder-gray-300(?![\w-]| dark:border-)/g, replace: 'border-gray-300 dark:border-gray-600' },
                { match: /\bborder-gray-100(?![\w-]| dark:border-)/g, replace: 'border-gray-100 dark:border-gray-800' },
            ];

            for (const r of replacements) {
                content = content.replace(r.match, r.replace);
            }

            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log('Updated ' + fullPath);
            }
        }
    }
}

processDir(path.join(__dirname, 'src'));
