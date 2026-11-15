import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [,, dir, out, colsArg] = process.argv;
const cols = +colsArg || 6;
const cell = 200, label = 22;
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.svg')).sort();
const rows = Math.ceil(files.length/cols);
const W = cols*cell, H = rows*(cell+label);
let body = '';
files.forEach((f,i)=>{
  const x = (i%cols)*cell, y = Math.floor(i/cols)*(cell+label);
  const inner = fs.readFileSync(path.join(dir,f),'utf8')
    .replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'');
  body += `<g transform="translate(${x+16},${y+14}) scale(${(cell-32)/256})">${inner}</g>`;
  body += `<text x="${x+cell/2}" y="${y+cell+12}" fill="#8b8698" font-family="monospace" font-size="13" text-anchor="middle">${f.replace('.svg','')}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#12111a"/>${body}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(out, files.length, `${W}x${H}`);
