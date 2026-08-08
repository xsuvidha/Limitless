/* Static checks for the kind of UI bug that doesn't throw an error.
   Run: node tools/check-ui.cjs                                      */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../public/index.html','utf8');
let fail=0;
const ok=(c,m)=>{ console.log((c?'✓ ':'✗ ')+m); if(!c) fail++; };

// 1. every [hidden] element whose class sets `display` needs an explicit guard,
//    because [hidden] is only display:none from the UA sheet and loses to any class rule.
const hiddenEls=[...s.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\bhidden\b/g)].map(m=>m[1]);
for(const id of hiddenEls){
  const tag=s.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))[0];
  const cls=(tag.match(/class="([^"]*)"/)||[,''])[1].split(/\s+/).filter(Boolean);
  const sets=[`#${id}`,...cls.map(c=>'.'+c)].some(sel=>
    [...s.matchAll(new RegExp(sel.replace('.','\\.').replace('#','#')+'[^{]*\\{([^}]*)\\}','g'))]
      .some(r=>/display\s*:/.test(r[1])));
  const guarded=[`#${id}[hidden]`,...cls.map(c=>`.${c}[hidden]`)].some(g=>s.includes(g));
  ok(!sets||guarded, `[hidden] on #${id} is not overridden by a display rule`);
}

// 2. every id referenced from JS exists in the markup
const ids=new Set([...s.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const used=new Set([...s.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
const missing=[...used].filter(u=>!ids.has(u)&&!u.startsWith('tick'));
ok(missing.length===0, `all JS element references exist${missing.length?': missing '+missing:''}`);

// 3. a full-screen overlay must not be clickable while transparent
const sheet=(s.match(/\.sheet\{([^}]*)\}/)||[,''])[1];
ok(/pointer-events\s*:\s*none/.test(sheet), '.sheet does not swallow clicks while hidden');

console.log(fail?`\n✗ ${fail} check(s) failed`:'\n✓ all UI checks pass');
process.exit(fail?1:0);
