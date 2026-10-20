const fs=require('fs');
let s=fs.readFileSync('src/basemap.js','utf8');
s=s.replace("if (w >= e || s >= n) return canvas;","if (w >= e || s >= n) return Promise.resolve(canvas);");
s=s.replace("      return canvas;\n    },","      return Promise.resolve(canvas);\n    },");
fs.writeFileSync('src/basemap.js',s);
console.log('ok');
