import fs from 'fs';
import csv from 'node:stream/consumers';

const STOP = new Set(['the','a','an','and','or','of','to','for','with','on','in','at','by','is','are','be','use','using']);
const TOKEN_RE = /[A-Za-z0-9']+/g;

function tokenize(text){
  return (text.match(TOKEN_RE) || []).map(t=>t.toLowerCase()).filter(t=>!STOP.has(t));
}

export function loadLibraryCsv(path){
  const buf = fs.readFileSync(path, 'utf8');
  const lines = buf.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  const idxId = header.split(',').indexOf('id');
  const idxText = header.split(',').indexOf('text');
  const docs = [];
  for(const line of lines){
    const [id,text] = line.split(/,(.*)/s).slice(0,2);
    if(!text) continue;
    docs.push({ id: id || String(docs.length+1), text: text.trim(), tokens: tokenize(text) });
  }
  const inverted = new Map();
  docs.forEach((d, i)=>{
    d.tokens.forEach(tok=>{
      const m = inverted.get(tok) || new Map();
      m.set(i, (m.get(i)||0)+1);
      inverted.set(tok, m);
    })
  })
  function search(query, limit=25){
    const q = tokenize(query);
    const scores = new Map();
    q.forEach(tok=>{
      const postings = inverted.get(tok);
      if(!postings) return;
      const idf = Math.log(1 + docs.length / (1 + postings.size));
      postings.forEach((tf, idx)=>{
        scores.set(idx, (scores.get(idx)||0) + (1+Math.log(1+tf))*idf);
      })
    })
    const ranked = [...scores.entries()].map(([i,s])=>[i, s/Math.sqrt(Math.max(1, docs[i].tokens.length))]).sort((a,b)=>b[1]-a[1]).slice(0,limit);
    return ranked.map(([i,s])=>({ id: docs[i].id, text: docs[i].text, score: Number(s.toFixed(4)) }));
  }
  return { search };
}


